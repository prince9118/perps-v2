import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:3001",
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),

  signup: (email: string, password: string) =>
    api.post("/auth/signup", { email, password }),

  me: () => api.get("/auth/me"),
};

export const marketApi = {
  getMarkets: () => api.get("/markets"),
  getPrice: (market: string) => api.get(`/price/${market}`),
  getFundingRate: () => api.get("/funding-rate"),
  getInsuranceFund: () => api.get("/insurance-fund"),
  getBackendStatus: () => api.get("/backend-staus"),
};


export const orderApi = {
  createOrder: (order: {
    market: string;
    side: "buy" | "sell";
    price: number;
    quantity: number;
    leverage: number;
    type: "limit" | "market";
  }) => api.post("/orders", order),

  getOrders: () => api.get("/orders"),
  cancelOrder: (id: string) => api.delete(`/orders/${id}`),
};

export const positionApi = {
  getPositions: () => api.get("/positions"),
  closePosition: (positionId: string) =>
    api.post("/positions/close", { positionId }),
  getHistory: () => api.get("/position-history"),
  getFills: () => api.get("/fills"),
};

