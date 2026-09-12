import React from "react";
import { createRoot } from "react-dom/client";
import App from "../../App.tsx";
createRoot(document.getElementById("root")).render(<App />);
// Exercise native confirmation decisions with browser dialogs; not OS-dialog verification.
import { Alert } from "react-native";
Alert.alert = (title, message, buttons = []) => {
  if (window.confirm(`${title}\n${message}`)) buttons.at(-1)?.onPress?.();
  else buttons.find((b) => b.style === "cancel")?.onPress?.();
};
