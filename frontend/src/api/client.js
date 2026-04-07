import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1",
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("china-erp-token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const extractApiError = (error, fallbackMessage = "Request failed") => {
  if (Array.isArray(error?.response?.data?.details) && error.response.data.details.length > 0) {
    const first = error.response.data.details[0];
    if (first?.field && first?.message) {
      return `${first.field}: ${first.message}`;
    }
    if (first?.message) {
      return first.message;
    }
  }

  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  if (error?.message) {
    return error.message;
  }

  return fallbackMessage;
};

export const fetchHealth = async () => {
  const response = await api.get("/health");
  return response.data;
};
