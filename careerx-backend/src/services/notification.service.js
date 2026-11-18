import * as notificationRepository from '../repositories/notification.repository.js';

export const list = (userId) => notificationRepository.listForUser(userId);
export const markRead = (userId, notificationId) => notificationRepository.markRead(userId, notificationId);