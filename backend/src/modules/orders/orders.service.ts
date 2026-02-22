import {
    Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import {
    Customer, Order, OrderItem, StockReservation,
    Inventory, ProductVariant, StockLedger,
} from '../../entities';
import { StockMovementAction } from '../../common/enums';
import { OrderStatus, OrderPaymentMethod, OrderPaymentStatus } from '../../common/enums';
import { EventsGateway } from '../events/events.gateway';

// ─── DTO ───
interface CreateOrderDto {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    shippingAddress: string;
    shippingCity: string;
    addressNotes?: string;
    paymentMethod: 'COD' | 'BANK_TRANSFER' | 'CARD';
    deliveryCompany?: string;
    items: { variantId: string; quantity: number }[];
}

const RESERVATION_TTL_MINUTES = 30;

@Injectable()
export class OrdersService {
    constructor(
        @InjectRepository(Customer) private customerRepo: Repository<Customer>,
        @InjectRepository(Order) private orderRepo: Repository<Order>,
        @InjectRepository(OrderItem) private orderItemRepo: Repository<OrderItem>,
        @InjectRepository(StockReservation) private reservationRepo: Repository<StockReservation>,
        @InjectRepository(Inventory) private invRepo: Repository<Inventory>,
        @InjectRepository(ProductVariant) private variantRepo: Repository<ProductVariant>,
        @InjectRepository(StockLedger) private ledgerRepo: Repository<StockLedger>,
        private dataSource: DataSource,
        private events: EventsGateway,
    ) { }

    /**
     * Generate unique order number: OMC-YYYYMMDD-XXXX
     */
    private async generateOrderNumber(): Promise<string> {
        const date = new Date();
        const prefix = `OMC-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        const count = await this.orderRepo.count({
            where: { orderNumber: prefix as any }, // TypeORM workaround for LIKE
        });
        // Count today's orders
        const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const todayOrders = await this.orderRepo
            .createQueryBuilder('o')
            .where('o.createdAt >= :start', { start: todayStart })
            .getCount();
        return `${prefix}-${String(todayOrders + 1).padStart(4, '0')}`;
    }

    /**
     * PUBLIC: Create a new storefront order.
     * - Finds or creates customer
     * - Validates stock availability
     * - Creates stock reservations (15-min TTL)
     * - Creates order record
     * - COD orders auto-confirm; bank transfer orders stay PENDING
     */
    async createOrder(dto: CreateOrderDto) {
        if (!dto.items || dto.items.length === 0) {
            throw new BadRequestException('Order must have at least one item');
        }

        return this.dataSource.transaction(async (em) => {
            // 1. Find or create customer
            let customer = await em.findOne(Customer, {
                where: { phone: dto.customerPhone },
            });
            if (!customer) {
                customer = await em.save(Customer, em.create(Customer, {
                    name: dto.customerName,
                    phone: dto.customerPhone,
                    email: dto.customerEmail,
                    address: dto.shippingAddress,
                    city: dto.shippingCity,
                    addressNotes: dto.addressNotes,
                }));
            }

            // 2. Validate items and calculate totals
            let subtotal = 0;
            const orderItems: Partial<OrderItem>[] = [];

            for (const item of dto.items) {
                if (item.quantity <= 0) throw new BadRequestException('Quantity must be positive');

                const variant = await em.findOne(ProductVariant, {
                    where: { id: item.variantId, isActive: true },
                    relations: ['product'],
                });
                if (!variant) throw new BadRequestException(`Variant ${item.variantId} not found`);

                // Check total stock across all branches
                const stockRows = await em.find(Inventory, { where: { variantId: item.variantId } });
                const totalStock = stockRows.reduce((s, r) => s + r.quantity, 0);

                // Also check active reservations that haven't expired
                const activeReservations = await em
                    .createQueryBuilder(StockReservation, 'sr')
                    .where('sr.variantId = :vid', { vid: item.variantId })
                    .andWhere('sr.isReleased = false')
                    .andWhere('sr.expiresAt > :now', { now: new Date() })
                    .select('SUM(sr.quantity)', 'reserved')
                    .getRawOne();
                const reserved = Number(activeReservations?.reserved || 0);
                const available = totalStock - reserved;

                if (available < item.quantity) {
                    throw new BadRequestException(
                        `Insufficient stock for ${variant.product?.name} (${variant.size}/${variant.color}). Available: ${available}`
                    );
                }

                const lineTotal = Number(variant.salePrice) * item.quantity;
                subtotal += lineTotal;

                orderItems.push({
                    variantId: item.variantId,
                    quantity: item.quantity,
                    unitPrice: Number(variant.salePrice),
                    lineTotal,
                    productName: variant.product?.name || '',
                    size: variant.size,
                    color: variant.color,
                    sku: variant.sku,
                });
            }

            // 3. Delivery fee (can be set by admin later or from city-based lookup)
            const deliveryFee = 0; // Phase 1: admin sets manually
            const total = subtotal + deliveryFee;

            // 4. Create order
            const orderNumber = await this.generateOrderNumber();
            const reservationExpiry = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);

            const order = await em.save(Order, em.create(Order, {
                orderNumber,
                customerId: customer.id,
                customerName: dto.customerName,
                customerPhone: dto.customerPhone,
                customerEmail: dto.customerEmail,
                shippingAddress: dto.shippingAddress,
                shippingCity: dto.shippingCity,
                addressNotes: dto.addressNotes,
                deliveryCompany: dto.deliveryCompany,
                deliveryFee,
                subtotal, total,
                paymentMethod: dto.paymentMethod === 'BANK_TRANSFER'
                    ? OrderPaymentMethod.BANK_TRANSFER
                    : dto.paymentMethod === 'CARD'
                        ? OrderPaymentMethod.CARD
                        : OrderPaymentMethod.COD,
                // COD and CARD auto-confirm; bank transfer stays PENDING
                paymentStatus: dto.paymentMethod === 'BANK_TRANSFER'
                    ? OrderPaymentStatus.PENDING
                    : OrderPaymentStatus.CONFIRMED,
                status: OrderStatus.PENDING,
                reservationExpiresAt: reservationExpiry,
            }));

            // 5. Save order items
            for (const oi of orderItems) {
                await em.save(OrderItem, em.create(OrderItem, { ...oi, orderId: order.id }));
            }

            // 6. Create stock reservations (reserve from branches with stock)
            for (const item of dto.items) {
                let remaining = item.quantity;
                const stockRows = await em.find(Inventory, {
                    where: { variantId: item.variantId },
                    order: { quantity: 'DESC' }, // Reserve from branches with most stock first
                });

                for (const row of stockRows) {
                    if (remaining <= 0) break;
                    const take = Math.min(remaining, row.quantity);
                    if (take <= 0) continue;

                    await em.save(StockReservation, em.create(StockReservation, {
                        orderId: order.id,
                        variantId: item.variantId,
                        branchId: row.branchId,
                        quantity: take,
                        expiresAt: reservationExpiry,
                    }));
                    remaining -= take;
                }
            }

            // 7. Update customer stats
            customer.totalOrders += 1;
            customer.totalSpent = Number(customer.totalSpent) + total;
            customer.address = dto.shippingAddress;
            customer.city = dto.shippingCity;
            await em.save(Customer, customer);

            // 8. Emit event
            this.events.server?.emit('order.created', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                total: order.total,
                city: order.shippingCity,
            });

            return {
                orderId: order.id,
                orderNumber: order.orderNumber,
                total: order.total,
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus,
                status: order.status,
                reservationExpiresAt: order.reservationExpiresAt?.toISOString(),
                message: dto.paymentMethod === 'BANK_TRANSFER'
                    ? 'Order placed! Please complete your bank transfer and confirm via WhatsApp.'
                    : dto.paymentMethod === 'CARD'
                        ? 'Order placed! Card payment confirmed. We will process your order shortly.'
                        : 'Order placed! We will contact you to confirm delivery.',
            };
        });
    }

    /**
     * PUBLIC: Upload payment proof for bank transfer orders.
     */
    async uploadPaymentProof(orderId: string, proofUrl: string) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Order not found');
        if (order.paymentMethod !== OrderPaymentMethod.BANK_TRANSFER) {
            throw new BadRequestException('This order does not require payment proof');
        }
        order.paymentProofUrl = proofUrl;
        await this.orderRepo.save(order);
        return { message: 'Payment proof uploaded. We will verify and confirm your order.' };
    }

    /**
     * PUBLIC: Track order status.
     */
    async trackOrder(orderNumber: string) {
        const order = await this.orderRepo.findOne({
            where: { orderNumber },
            relations: ['items'],
        });
        if (!order) throw new NotFoundException('Order not found');
        return {
            orderNumber: order.orderNumber,
            status: order.status,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            total: order.total,
            deliveryCompany: order.deliveryCompany,
            trackingNumber: order.trackingNumber,
            shippingCity: order.shippingCity,
            items: order.items.map(i => ({
                productName: i.productName,
                size: i.size,
                color: i.color,
                quantity: i.quantity,
                unitPrice: Number(i.unitPrice),
                lineTotal: Number(i.lineTotal),
            })),
            createdAt: order.createdAt,
        };
    }

    // ═══════════════════════════════════════════
    // ADMIN: Order Management (for OMCS dashboard)
    // ═══════════════════════════════════════════

    /**
     * ADMIN: List all orders with filters.
     */
    async findAll(query: {
        status?: string; city?: string; paymentMethod?: string;
        startDate?: string; endDate?: string; page?: number; limit?: number;
    }) {
        const page = Math.max(1, query.page || 1);
        const limit = Math.min(100, Math.max(1, query.limit || 20));

        const qb = this.orderRepo.createQueryBuilder('o')
            .leftJoinAndSelect('o.customer', 'c')
            .leftJoinAndSelect('o.items', 'i')
            .leftJoinAndSelect('o.fulfilledFromBranch', 'b');

        if (query.status) qb.andWhere('o.status = :st', { st: query.status });
        if (query.city) qb.andWhere('LOWER(o.shippingCity) LIKE :city', { city: `%${query.city.toLowerCase()}%` });
        if (query.paymentMethod) qb.andWhere('o.paymentMethod = :pm', { pm: query.paymentMethod });
        if (query.startDate) qb.andWhere('o.createdAt >= :start', { start: query.startDate });
        if (query.endDate) {
            const end = new Date(query.endDate);
            end.setDate(end.getDate() + 1);
            qb.andWhere('o.createdAt < :end', { end: end.toISOString().slice(0, 10) });
        }

        const [orders, total] = await qb.orderBy('o.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return { orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    /**
     * ADMIN: Get single order detail.
     */
    async findOne(orderId: string) {
        return this.orderRepo.findOne({
            where: { id: orderId },
            relations: ['customer', 'items', 'fulfilledFromBranch'],
        });
    }

    /**
     * ADMIN: Update order status (workflow progression).
     */
    async updateStatus(orderId: string, status: OrderStatus, adminNotes?: string) {
        const order = await this.orderRepo.findOne({
            where: { id: orderId },
            relations: ['items'],
        });
        if (!order) throw new NotFoundException('Order not found');

        const oldStatus = order.status;

        // Validate transitions
        const allowed: Record<string, string[]> = {
            [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
            [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
            [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
            [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
            [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
        };
        if (!allowed[oldStatus]?.includes(status)) {
            throw new BadRequestException(`Cannot transition from ${oldStatus} to ${status}`);
        }

        order.status = status;
        if (adminNotes) order.adminNotes = (order.adminNotes || '') + `\n[${new Date().toISOString()}] ${adminNotes}`;

        // Handle cancellation → release stock reservations
        if (status === OrderStatus.CANCELLED) {
            await this.releaseReservations(orderId);
        }

        // Handle confirmation → convert reservations to actual stock deduction
        if (status === OrderStatus.CONFIRMED && oldStatus === OrderStatus.PENDING) {
            await this.confirmReservations(orderId);
        }

        await this.orderRepo.save(order);

        this.events.server?.emit('order.updated', {
            orderId, orderNumber: order.orderNumber,
            oldStatus, newStatus: status,
        });

        return order;
    }

    /**
     * ADMIN: Confirm bank transfer payment.
     * This also transitions the order to CONFIRMED and performs FIFO stock deduction.
     */
    async confirmPayment(orderId: string, note?: string) {
        const order = await this.orderRepo.findOne({ where: { id: orderId }, relations: ['items'] });
        if (!order) throw new NotFoundException('Order not found');
        order.paymentStatus = OrderPaymentStatus.CONFIRMED;
        if (note) order.paymentNote = note;

        // Auto-confirm the order and deduct stock if still PENDING
        if (order.status === OrderStatus.PENDING) {
            order.status = OrderStatus.CONFIRMED;
            await this.confirmReservations(orderId);
        }

        await this.orderRepo.save(order);

        this.events.server?.emit('order.updated', {
            orderId, orderNumber: order.orderNumber,
            oldStatus: OrderStatus.PENDING, newStatus: OrderStatus.CONFIRMED,
        });

        return order;
    }

    /**
     * ADMIN: Reject bank transfer payment.
     */
    async rejectPayment(orderId: string, note?: string) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Order not found');
        order.paymentStatus = OrderPaymentStatus.REJECTED;
        if (note) order.paymentNote = note;
        await this.orderRepo.save(order);
        return order;
    }

    /**
     * ADMIN: Set delivery details (company, tracking, fee).
     */
    async updateDelivery(orderId: string, data: {
        deliveryCompany?: string; trackingNumber?: string;
        deliveryFee?: number; fulfilledFromBranchId?: string;
    }) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Order not found');
        if (data.deliveryCompany) order.deliveryCompany = data.deliveryCompany;
        if (data.trackingNumber) order.trackingNumber = data.trackingNumber;
        if (data.deliveryFee !== undefined) {
            order.deliveryFee = data.deliveryFee;
            order.total = Number(order.subtotal) + data.deliveryFee;
        }
        if (data.fulfilledFromBranchId) order.fulfilledFromBranchId = data.fulfilledFromBranchId;
        await this.orderRepo.save(order);
        return order;
    }

    // ─── Stock Reservation Helpers ───

    /**
     * Convert reservations into actual stock deductions (FIFO).
     */
    private async confirmReservations(orderId: string) {
        const reservations = await this.reservationRepo.find({
            where: { orderId, isReleased: false },
        });
        for (const res of reservations) {
            // Deduct from FIFO batches at the reserved branch
            const batches = await this.invRepo.find({
                where: { variantId: res.variantId, branchId: res.branchId },
                order: { createdAt: 'ASC' },
            });
            let remaining = res.quantity;
            for (const batch of batches) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, batch.quantity);
                batch.quantity -= take;
                await this.invRepo.save(batch);
                remaining -= take;
            }
            res.isReleased = true; // Mark reservation as consumed
            await this.reservationRepo.save(res);

            // Emit inventory update
            const totalAfter = batches.reduce((s, b) => s + b.quantity, 0);
            this.events.emitInventoryUpdated({
                variantId: res.variantId,
                branchId: res.branchId,
                quantity: totalAfter,
            });

            // Log to StockLedger for audit trail
            await this.ledgerRepo.save(this.ledgerRepo.create({
                variantId: res.variantId,
                branchId: res.branchId,
                movementType: StockMovementAction.ORDER_CONFIRM,
                qtyDelta: -res.quantity,
                qtyAfter: totalAfter,
                referenceType: 'order',
                referenceId: orderId,
                note: `Online order confirmed — ${res.quantity} units deducted (FIFO)`,
            }));
        }
    }

    /**
     * Release reservations (order cancelled or expired).
     * If the order was already CONFIRMED (stock deducted), restore inventory.
     */
    private async releaseReservations(orderId: string) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) return;

        const reservations = await this.reservationRepo.find({
            where: { orderId },
        });

        // Check if stock was already deducted (order moved past PENDING)
        const wasConfirmed = order.status !== OrderStatus.PENDING;

        for (const res of reservations) {
            if (res.isReleased && !wasConfirmed) continue; // Already released and never deducted

            if (wasConfirmed) {
                // Stock was deducted → restore it back to inventory
                const inv = await this.invRepo.findOne({
                    where: { variantId: res.variantId, branchId: res.branchId },
                });
                if (inv) {
                    inv.quantity += res.quantity;
                    await this.invRepo.save(inv);

                    // Emit live update
                    this.events.emitInventoryUpdated({
                        variantId: res.variantId,
                        branchId: res.branchId,
                        quantity: inv.quantity,
                    });

                    // Audit trail
                    await this.ledgerRepo.save(this.ledgerRepo.create({
                        variantId: res.variantId,
                        branchId: res.branchId,
                        movementType: StockMovementAction.ORDER_CANCEL,
                        qtyDelta: res.quantity,
                        qtyAfter: inv.quantity,
                        referenceType: 'order',
                        referenceId: orderId,
                        note: `Order cancelled — ${res.quantity} units restored to inventory`,
                    }));
                }
            }

            // Mark reservation as released
            res.isReleased = true;
            await this.reservationRepo.save(res);
        }
    }

    /**
     * CRON: Release expired reservations.
     * Should be called periodically (e.g., every 5 min).
     */
    async releaseExpiredReservations() {
        const expired = await this.reservationRepo.find({
            where: { isReleased: false, expiresAt: LessThan(new Date()) },
        });

        // Group by orderId so we can cancel the order once
        const orderIds = new Set<string>();
        for (const res of expired) {
            res.isReleased = true;
            await this.reservationRepo.save(res);
            orderIds.add(res.orderId);

            // Log to StockLedger
            const totalStock = await this.invRepo
                .createQueryBuilder('i')
                .where('i.variantId = :vid AND i.branchId = :bid', { vid: res.variantId, bid: res.branchId })
                .select('SUM(i.quantity)', 'total')
                .getRawOne();
            await this.ledgerRepo.save(this.ledgerRepo.create({
                variantId: res.variantId,
                branchId: res.branchId,
                movementType: StockMovementAction.ORDER_CANCEL,
                qtyDelta: 0, // Reservations don't deduct real stock; releasing just frees the hold
                qtyAfter: Number(totalStock?.total || 0),
                referenceType: 'order',
                referenceId: res.orderId,
                note: `Reservation expired — ${res.quantity} units released`,
            }));
        }

        // Auto-cancel orders whose reservations expired (if still PENDING)
        for (const orderId of orderIds) {
            const order = await this.orderRepo.findOne({ where: { id: orderId } });
            if (order && order.status === OrderStatus.PENDING) {
                order.status = OrderStatus.CANCELLED;
                order.adminNotes = (order.adminNotes || '') + `\n[${new Date().toISOString()}] Auto-cancelled: reservation expired after ${RESERVATION_TTL_MINUTES} minutes`;
                await this.orderRepo.save(order);
                this.events.server?.emit('order.updated', {
                    orderId, orderNumber: order.orderNumber,
                    oldStatus: OrderStatus.PENDING, newStatus: OrderStatus.CANCELLED,
                });
            }
        }

        if (expired.length > 0) {
            console.log(`🕐 Released ${expired.length} expired stock reservations, cancelled ${orderIds.size} orders`);
        }
        return expired.length;
    }

    /**
     * ADMIN: Get order stats for dashboard.
     */
    async getStats() {
        const [pending, confirmed, processing, shipped, delivered, cancelled] = await Promise.all([
            this.orderRepo.count({ where: { status: OrderStatus.PENDING } }),
            this.orderRepo.count({ where: { status: OrderStatus.CONFIRMED } }),
            this.orderRepo.count({ where: { status: OrderStatus.PROCESSING } }),
            this.orderRepo.count({ where: { status: OrderStatus.SHIPPED } }),
            this.orderRepo.count({ where: { status: OrderStatus.DELIVERED } }),
            this.orderRepo.count({ where: { status: OrderStatus.CANCELLED } }),
        ]);

        const totalRevenue = await this.orderRepo
            .createQueryBuilder('o')
            .select('SUM(o.total)', 'total')
            .where('o.status IN (:...statuses)', { statuses: ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] })
            .getRawOne();

        return {
            pending, confirmed, processing, shipped, delivered, cancelled,
            totalActiveOrders: pending + confirmed + processing + shipped,
            totalRevenue: Number(totalRevenue?.total || 0),
            totalCustomers: await this.customerRepo.count(),
        };
    }
}
