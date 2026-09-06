import api from '../client';

export const authService = {
  login(email, password) {
    return api.post('/auth/login', { email, password });
  },
  signup(payload) {
    return api.post('/auth/signup', payload);
  },
};
