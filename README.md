# Outlet Master Control System (OMCS)

A comprehensive backend and frontend solution for managing a clothing store outlet, tailored for the Libyan market.

## Key Features
- **POS**: Full point-of-sale with offline capabilities, discount management, and manager override.
- **Inventory**: Multi-branch stock tracking, low stock alerts, and transfers.
- **Products**: Matrix-style variant creation, image uploads, and barcode generation.
- **Accounting**: USD parallel market rate support, historical cost tracking on individual variants.
- **Barcodes**: Custom label generator (Use 50x25mm labels).

## Deployment
### Backend
1. `cd backend`
2. `npm install`
3. `npm run start:dev` (Development) or `npm run build && npm run start:prod` (Production)

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev` (Development) or `npm run build && npm start` (Production)

## Recent Updates
- **Accounting**: Added receipt print details for purchase rates and sale-time exchange rates.
- **Barcodes**: Overhauled label generator for perfect mm-sizing.
- **Products**: Added bulk variant creation with purchase data (USD cost, rate, date).
- **Images**: Added image upload and display across POS and Inventory.

## License
Private / Proprietary
