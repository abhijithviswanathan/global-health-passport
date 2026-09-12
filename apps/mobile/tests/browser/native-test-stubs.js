// Browser test harness only. No assertion about native secure storage or biometrics.
export const StatusBar = () => null;
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = "test-only";
const preferences = new Map();
export const getItemAsync = async (key) => preferences.get(key) || null;
export const setItemAsync = async (key, value) => {
  if (key.includes("summary-v1"))
    throw Error("Native secure storage is not available in browser tests.");
  preferences.set(key, value);
};
export const deleteItemAsync = async (key) => {
  preferences.delete(key);
};
export const hasHardwareAsync = async () => false;
export const isEnrolledAsync = async () => false;
export const authenticateAsync = async () => ({ success: false });

// File chooser is a browser harness substitute, not native camera verification.
export const requestCameraPermissionsAsync = async () => ({ granted: true });
export const requestMediaLibraryPermissionsAsync = async () => ({
  granted: true,
});
export const cacheDirectory = null;
export const deleteAsync = async () => undefined;
export const launchImageLibraryAsync = async () =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png";
    input.setAttribute("aria-label", "Native photo chooser");
    input.onchange = () => {
      const file = input.files[0];
      if (!file) {
        input.remove();
        resolve({ canceled: true });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        input.remove();
        resolve({
          canceled: false,
          assets: [
            {
              uri: reader.result,
              mimeType: file.type,
              fileSize: file.size,
              fileName: file.name,
            },
          ],
        });
      };
      reader.readAsDataURL(file);
    };
    input.oncancel = () => {
      input.remove();
      resolve({ canceled: true });
    };
    document.body.appendChild(input);
    input.click();
  });
export const launchCameraAsync = launchImageLibraryAsync;
