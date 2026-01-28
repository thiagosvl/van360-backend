# Plan: Fix Login Persistence Issues (Stored for Future)

The user reports that login is not persistent. Analysis shows potential issues with cross-tab token synchronization and state updates after token refresh.

## Proposed Changes

### [Component] Frontend - Session Management

#### [MODIFY] [sessionManager.ts](file:///c:/Users/thiag/Desktop/Projetos/van-control/src/services/sessionManager.ts)
- Add a listener for `storage` events to synchronize the session across multiple tabs.
- Ensure that when `localStorage` is updated in one tab (e.g., after a token refresh), other tabs update their internal state immediately.

#### [MODIFY] [useSession.ts](file:///c:/Users/thiag/Desktop/Projetos/van-control/src/hooks/business/useSession.ts)
- Update the `onAuthStateChange` listener to update the state even if the `userId` hasn't changed, ensuring that components always have the most recent `access_token`.

### [Component] Backend - Auth Service

#### [MODIFY] [auth.service.ts](file:///c:/Users/thiag/Desktop/Projetos/van360-backend/src/services/auth.service.ts)
- Ensure that the `/refresh` logic returns the full user object to keep the frontend state consistent.

## Verification Plan

### Manual Verification
1. Login to the application in one tab.
2. Open the application in a second tab. Both should be logged in.
3. Manually invalidate or wait for the token to expire (or trigger a refresh manually in Tab A).
4. Verify that Tab B picks up the new token from `localStorage` without logging out the user.
5. Close the browser and reopen. Verify that the session is still active.
