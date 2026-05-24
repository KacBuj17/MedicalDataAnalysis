import axios from 'axios';

const API_BASE = 'http://localhost:5001';

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('doctorName');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login:  (username, password) => api.post('/auth/login', { username, password }),
  verify: () => api.get('/auth/verify'),
};

export const patientsAPI = {
  getAll:           ()         => api.get('/patients'),
  getOne:           (id)       => api.get(`/patients/${id}`),
  create:           (data)     => api.post('/patients', data),
  delete:           (id)       => api.delete(`/patients/${id}`),
  getExaminations:  (id)       => api.get(`/patients/${id}/examinations`),
  addExamination:   (id, data) => api.post(`/patients/${id}/examinations`, data),
  deleteExamination:(examId)   => api.delete(`/examinations/${examId}`),
};

export const analyzeAPI = {
  statistics:  (field)        => api.get(`/analyze/statistics/${field}`),
  compare:     (field, value) => api.post('/analyze/compare', { field, value }),
  fullProfile: (data)         => api.post('/analyze/full_profile', data),
  fieldMeta:   ()             => api.get('/meta/fields'),
};

export default api;
