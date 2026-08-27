/**
 * Firebase client services — split from legacy firebaseService.js
 */
export { COL, getMatchId, userNotificationsCol, bannedDeviceDoc } from './constants';

export { authService } from './authService';
export { userService } from './userService';
export { matchService } from './matchService';
export { likeService } from './likeService';
export { safetyService } from './safetyService';
export { aiSuggestionService } from './aiSuggestionService';
export { moderationNoticeService } from './moderationNoticeService';
export { messageService } from './messageService';
export { translationService } from './translationService';
export { liveRandomService } from './liveRandomService';
export { blockService } from './blockService';
export { reportService } from './reportService';
export { notificationService } from './notificationService';
export { deviceBanService } from './deviceBanService';
export { appUpdateService } from './appUpdateService';
export { checkUserRoleFromAdminCollection } from './roles';
export { adminService } from './adminService';
export { privacyAdminService } from './privacyAdminService';
export { contactBlockService } from './contactBlockService';
export { contactUploadService } from './contactUploadService';
export { photoUploadService } from './photoUploadService';
export { storageService } from './storageService';
export { verificationService } from './verificationService';
export { datePlanService } from './datePlanService';
export { clubService } from './clubService';
