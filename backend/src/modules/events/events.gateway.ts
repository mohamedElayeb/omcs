import {
    WebSocketGateway, WebSocketServer,
    OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';

/**
 * OMCS Realtime Events Gateway
 * 
 * Events emitted:
 * - sale.created        { sale, branchId }
 * - sale.voided         { saleId, invoiceNumber, branchId, total, voidedBy }
 * - inventory.updated   { variantId, branchId, quantity }
 * - transfer.created    { transfer }
 * - transfer.shipped    { transfer }
 * - transfer.received   { transfer }
 * - return.created      { return, branchId }
 * - return.completed    { return, branchId }
 * - price.updated       { variantId, oldPrice, newPrice }
 * - stock.alert         { variantId, branchId, quantity, threshold }
 * - product.changed     { productId, action }
 */
@Injectable()
@WebSocketGateway({
    cors: {
        origin: true,
        credentials: true,
    },
    namespace: '/ws',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private connectedClients = new Map<string, { branchId?: string; userId?: string }>();

    handleConnection(client: Socket) {
        const branchId = client.handshake.query.branchId as string;
        const userId = client.handshake.query.userId as string;
        this.connectedClients.set(client.id, { branchId, userId });

        if (branchId) {
            client.join(`branch:${branchId}`);
        }
        client.join('global');
        console.log(`🔌 WS client connected: ${client.id} (branch: ${branchId || 'all'})`);
    }

    handleDisconnect(client: Socket) {
        this.connectedClients.delete(client.id);
        console.log(`🔌 WS client disconnected: ${client.id}`);
    }

    // ── Emit methods for services to call ──

    emitSaleCreated(sale: any) {
        this.server.to(`branch:${sale.branchId}`).emit('sale.created', sale);
        this.server.to('global').emit('sale.created', { branchId: sale.branchId, total: sale.total });
    }

    emitSaleVoided(data: { saleId: string; invoiceNumber: string; branchId: string; total: number; voidedBy: string }) {
        this.server.to(`branch:${data.branchId}`).emit('sale.voided', data);
        this.server.to('global').emit('sale.voided', data);
    }

    emitInventoryUpdated(data: { variantId: string; branchId: string; quantity: number }) {
        this.server.to(`branch:${data.branchId}`).emit('inventory.updated', data);
        this.server.to('global').emit('inventory.updated', data);

        // Auto-emit low stock alert
        if (data.quantity <= 5) {
            this.server.to('global').emit('stock.alert', {
                ...data,
                threshold: 5,
                message: `Low stock alert: ${data.quantity} remaining`,
            });
        }
    }

    emitTransferCreated(transfer: any) {
        this.server.to(`branch:${transfer.fromBranchId}`).emit('transfer.created', transfer);
        this.server.to(`branch:${transfer.toBranchId}`).emit('transfer.created', transfer);
        this.server.to('global').emit('transfer.created', transfer);
    }

    emitTransferShipped(transfer: any) {
        this.server.to(`branch:${transfer.fromBranchId}`).emit('transfer.shipped', transfer);
        this.server.to(`branch:${transfer.toBranchId}`).emit('transfer.shipped', transfer);
        this.server.to('global').emit('transfer.shipped', transfer);
    }

    emitTransferReceived(transfer: any) {
        this.server.to(`branch:${transfer.fromBranchId}`).emit('transfer.received', transfer);
        this.server.to(`branch:${transfer.toBranchId}`).emit('transfer.received', transfer);
        this.server.to('global').emit('transfer.received', transfer);
    }

    emitReturnCreated(ret: any) {
        this.server.to(`branch:${ret.branchId}`).emit('return.created', ret);
        this.server.to('global').emit('return.created', { branchId: ret.branchId, refundAmount: ret.refundAmount });
    }

    emitReturnCompleted(ret: any) {
        this.server.to(`branch:${ret.branchId}`).emit('return.completed', ret);
        this.server.to('global').emit('return.completed', { branchId: ret.branchId, refundAmount: ret.refundAmount });
    }

    emitPriceUpdated(data: { variantId: string; oldPrice: number; newPrice: number; changedBy: string }) {
        this.server.to('global').emit('price.updated', data);
    }

    emitProductChanged(data: { productId: string; action: 'created' | 'updated' }) {
        this.server.to('global').emit('product.changed', data);
    }

    getConnectedCount(): number {
        return this.connectedClients.size;
    }
}
