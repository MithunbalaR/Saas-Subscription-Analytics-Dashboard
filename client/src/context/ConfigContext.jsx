import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client.js";

const ConfigContext = createContext({ vapidPublicKey: null, aiEnabled: true, aiProvider: null, whatsappEnabled: false, loaded: false });

// Which optional features the server has keys for (push notifications, AI assistant, WhatsApp).
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState({ vapidPublicKey: null, aiEnabled: true, aiProvider: null, whatsappEnabled: false, loaded: false });

  useEffect(() => {
    api
      .get("/auth/config")
      .then(({ data }) => setConfig({ ...data, loaded: true }))
      .catch(() => setConfig((c) => ({ ...c, loaded: true })));
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useConfig = () => useContext(ConfigContext);
