import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../enums';

/**
 * BranchGuard: Ensures non-owner users can only access data from their assigned branch.
 * Checks request.params.branchId or request.body.branchId or request.query.branchId
 * against the user's branchId. Owners are exempt.
 */
@Injectable()
export class BranchGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) return false;

        // Owners can access all branches
        if (user.role === UserRole.OWNER) return true;

        // If user has no branch assigned, deny
        if (!user.branchId) return false;

        // Check branchId from params, body, or query
        const requestedBranchId =
            request.params?.branchId ||
            request.body?.branchId ||
            request.query?.branchId;

        // If no branchId in request, allow (the service should filter by user.branchId)
        if (!requestedBranchId) return true;

        // Enforce branch restriction
        if (requestedBranchId !== user.branchId) {
            throw new ForbiddenException('You can only access your assigned branch');
        }

        return true;
    }
}
