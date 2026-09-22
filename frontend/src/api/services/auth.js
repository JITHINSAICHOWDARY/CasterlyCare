import api from '../client';

export const authService = {
  login(email, password) {
    return api.post('/auth/login', { email, password });
  },
  signup(payload) {
    return api.post('/auth/signup', payload);
  },
  requestOtp(phone) {
    return api.post('/auth/otp/request', { phone });
  },
  verifyOtp(phone, code) {
    return api.post('/auth/otp/verify', { phone, code });
  },
  google(credential) {
    return api.post('/auth/google', { credential });
  },
  changePassword(currentPassword, newPassword) {
    return api.post('/auth/change-password', { currentPassword, newPassword });
  },
};
