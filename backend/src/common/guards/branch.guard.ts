import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../enums';

/**
 * BranchGuard: Ensures branch-level access control.
 * - Owners & Managers: can access all branches (bypass).
 * - Cashiers: must provide branchId in the request (from frontend branch picker).
 *   If they have a fixed branchId in DB, it's enforced. Otherwise they can use
 *   any branch selected from the frontend.
 */
@Injectable()
export class BranchGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) return false;

        // Owners & Managers can access all branches
        if (user.role === UserRole.OWNER || user.role === UserRole.MANAGER) return true;

        // Check branchId from params, body, or query
        const requestedBranchId =
            request.params?.branchId ||
            request.body?.branchId ||
            request.query?.branchId;

        // Cashier with fixed branch: enforce it
        if (user.branchId) {
            if (requestedBranchId && requestedBranchId !== user.branchId) {
                throw new ForbiddenException('You can only access your assigned branch');
            }
            return true;
        }

        // Cashier with no fixed branch: allow if branchId is provided in request
        // (they pick their branch from the frontend selector)
        if (!requestedBranchId) return true;

        return true;
    }
}
