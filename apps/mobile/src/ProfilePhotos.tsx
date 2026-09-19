/**
 * Native profile and clinical identification photos using Expo image/camera picking.
 * PhotoActivityContext tells App.tsx about a temporary system-picker transition so
 * it can distinguish that flow from ordinary backgrounding. Server visibility checks
 * remain authoritative; face presence is not identity verification.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { request, type User } from "./api";
export const PhotoActivityContext = createContext<(active: boolean) => void>(
  () => undefined,
);
export type Photo = {
  id: string;
  canView: boolean;
  holder: string;
  holderScope: string;
  purpose: string;
  createdAt: string;
};
export type PhotoColors = {
  card: string;
  bg: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  button: string;
};
export function PhotoImage({
  id,
  label,
  size = 88,
}: {
  id: string;
  label: string;
  size?: number;
}) {
  const [uri, setUri] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      request<{ dataUri: string }>(`/photos/${id}/data`)
        .then((r) => {
          if (active) setUri(r.dataUri);
        })
        .catch(() => {
          if (active) setUri("");
        });
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);
  return uri ? (
    <Image
      source={{ uri }}
      accessibilityLabel={label}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#dcebe5",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text>◯</Text>
    </View>
  );
}
export function ProfileAvatar({
  owner,
  name,
  colors,
  size = 48,
}: {
  owner: string;
  name: string;
  colors: PhotoColors;
  size?: number;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      request<{ photo: Photo | null }>(`/profiles/${owner}`)
        .then((r) => {
          if (active) setPhoto(r.photo);
        })
        .catch(() => {
          if (active) setPhoto(null);
        });
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [owner]);
  return photo ? (
    <PhotoImage id={photo.id} label={`${name} profile`} size={size} />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.bg,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ color: colors.accent, fontWeight: "700", fontSize: 18 }}>
        {name
          .split(" ")
          .slice(0, 2)
          .map((n) => n[0])
          .join("")}
      </Text>
    </View>
  );
}
export function PhotoPicker({
  colors,
  endpoint = "/profile/photo",
  extra = {},
  onSaved,
}: {
  colors: PhotoColors;
  endpoint?: string;
  extra?: Record<string, string>;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState("");
  const alive = useRef(true),
    picking = useRef(false);
  const photoActivity = useContext(PhotoActivityContext);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function pick(camera: boolean) {
    if (picking.current) return;
    picking.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    let temporary = "";
    try {
      photoActivity(true);
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Allow access in device settings, or continue without a photo.",
        );
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          });
      photoActivity(false);
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      temporary = asset.uri;
      if (!alive.current) return;
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024)
        throw new Error("Choose a JPEG or PNG under 5 MB.");
      const body = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(asset.uri)).blob();
        body.append("file", blob, "portrait.jpg");
      } else
        body.append("file", {
          uri: asset.uri,
          type: asset.mimeType || "image/jpeg",
          name: asset.fileName || "portrait.jpg",
        } as unknown as Blob);
      for (const [k, v] of Object.entries(extra)) body.append(k, v);
      await request(endpoint, "POST", body, 45000);
      if (alive.current) {
        setPreview(!onSaved && Platform.OS === "web" ? asset.uri : "");
        setMessage("Photo saved locally. Face presence checked.");
        onSaved?.();
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Unable to save photo");
    } finally {
      photoActivity(false);
      if (
        Platform.OS !== "web" &&
        temporary &&
        FileSystem.cacheDirectory &&
        temporary.startsWith(FileSystem.cacheDirectory)
      )
        await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(
          () => undefined,
        );
      picking.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <View style={s.stack}>
      {preview && (
        <Image
          source={{ uri: preview }}
          accessibilityLabel="Selected profile preview"
          style={{ width: 88, height: 88, borderRadius: 44 }}
        />
      )}
      <View style={s.row}>
        {["Choose photo", "Take photo"].map((label, i) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void pick(i === 1)}
            style={[
              s.button,
              {
                backgroundColor: colors.card,
                borderColor: colors.line,
                flex: 1,
              },
            ]}
          >
            <Text style={{ color: colors.ink, fontWeight: "600" }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[s.caption, { color: colors.muted }]}>
        One clear face · JPEG/PNG · up to 5 MB. Checked on this computer without
        cloud analysis. This does not verify identity or liveness.
      </Text>
      {busy && (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.accent }}>
          Checking and saving your photo…
        </Text>
      )}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {message && (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.accent }}>
          {message}
        </Text>
      )}
    </View>
  );
}
export function ProfilePanel({
  user,
  colors,
}: {
  user: User;
  colors: PhotoColors;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null),
    [visibility, setVisibility] = useState("none"),
    [names, setNames] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  async function load() {
    try {
      const p = await request<{
        photo: Photo | null;
        visibility: string;
        viewers: { username: string }[];
      }>("/profile");
      if (mounted.current) {
        setPhoto(p.photo);
        setVisibility(p.visibility);
        setNames(p.viewers.map((v) => v.username).join(", "));
      }
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Unable to load profile");
    }
  }
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await request("/profile/visibility", "PUT", {
        visibility,
        usernames: names
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean),
      });
      setMessage("Photo visibility saved. Medical sharing is separate.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.stack}>
      <View
        style={[
          s.card,
          { backgroundColor: colors.card, borderColor: colors.line },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[s.heading, { color: colors.ink }]}
        >
          Your profile photo
        </Text>
        <View style={s.row}>
          {photo ? (
            <PhotoImage id={photo.id} label="Your profile photo" />
          ) : (
            <ProfileAvatar
              owner={user.id}
              name={user.displayName}
              colors={colors}
              size={88}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={[s.heading, { color: colors.ink }]}>
              {user.displayName}
            </Text>
            <Text style={{ color: colors.muted }}>{user.healthId}</Text>
          </View>
        </View>
        <PhotoPicker
          key={photo?.id || "empty"}
          colors={colors}
          onSaved={() => void load()}
        />
        {photo && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert(
                "Remove your profile photo?",
                "Your current profile image will be removed.",
                [
                  { text: "Keep photo", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => {
                      void request("/profile/photo", "DELETE")
                        .then(() => load())
                        .catch((e) => setError(e.message));
                    },
                  },
                ],
              )
            }
            style={[s.button, { borderColor: colors.line }]}
          >
            <Text style={{ color: colors.ink }}>Remove profile photo</Text>
          </Pressable>
        )}
      </View>
      <View
        style={[
          s.card,
          { backgroundColor: colors.card, borderColor: colors.line },
        ]}
      >
        <Text
          accessibilityRole="header"
          style={[s.heading, { color: colors.ink }]}
        >
          Who can see your photo?
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Profile photo visibility"
          style={s.stack}
        >
          {[
            ["none", "Nobody — only me"],
            ["care_team", "My authorized care team"],
            ["selected", "Selected people"],
            ["signed_in", "Public — signed-in users"],
          ].map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: visibility === value }}
              aria-checked={visibility === value}
              onPress={() => {
                setVisibility(value);
                setMessage("");
              }}
              style={[
                s.choice,
                {
                  borderColor: colors.line,
                  backgroundColor:
                    visibility === value ? colors.bg : colors.card,
                },
              ]}
            >
              <Text style={{ color: colors.ink }}>
                {visibility === value ? "◉" : "○"} {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {visibility === "selected" && (
          <>
            <Text style={{ color: colors.ink }}>
              Selected account usernames
            </Text>
            <TextInput
              accessibilityLabel="Selected account usernames"
              placeholder="alex, jordan"
              placeholderTextColor={colors.muted}
              value={names}
              onChangeText={setNames}
              autoCapitalize="none"
              style={[s.input, { color: colors.ink, borderColor: colors.line }]}
            />
            <Text style={[s.caption, { color: colors.muted }]}>
              Existing usernames separated by commas. This shares your photo
              only.
            </Text>
          </>
        )}
        {visibility === "signed_in" && (
          <Text style={[s.caption, { color: colors.muted }]}>
            Visible to signed-in accounts with your profile reference, not the
            open internet.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void save()}
          style={[
            s.button,
            { backgroundColor: colors.button, borderColor: colors.button },
          ]}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            Save visibility
          </Text>
        </Pressable>
        {error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {message && (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.accent }}
          >
            {message}
          </Text>
        )}
      </View>
      {user.role === "patient" && (
        <ClinicalPhotos patientId={user.id} colors={colors} self />
      )}
    </View>
  );
}
export function ClinicalPhotos({
  patientId,
  colors,
  self = false,
}: {
  patientId: string;
  colors: PhotoColors;
  self?: boolean;
}) {
  const [items, setItems] = useState<Photo[]>([]),
    [error, setError] = useState(""),
    [purpose, setPurpose] = useState("Patient identification during care"),
    [scope, setScope] = useState("organization"),
    [authorized, setAuthorized] = useState(false),
    [open, setOpen] = useState(self);
  const generation = useRef(0);
  async function load() {
    const current = ++generation.current;
    try {
      const p = await request<Photo[]>(
        `/patients/${patientId}/identification-photos`,
      );
      if (current === generation.current) {
        setItems(p);
        setError("");
      }
    } catch (e) {
      if (current === generation.current) {
        setItems([]);
        setError(e instanceof Error ? e.message : "Unable to load photos");
      }
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [patientId]);
  return (
    <View
      style={[
        s.card,
        { backgroundColor: colors.card, borderColor: colors.line },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={() => setOpen(!open)}
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={[s.heading, { color: colors.ink }]}>
          {self ? "Clinical photos held for you" : "Identification photos"}{" "}
          {open ? "⌃" : "⌄"}
        </Text>
      </Pressable>
      {open && (
        <>
          <Text style={[s.caption, { color: colors.muted }]}>
            {self
              ? "These images are separate from your profile photo. Only the clinical holder can view the image. You can see the holder and stated purpose."
              : "Private to the selected clinical holder, with current document-sharing permission. The patient can see the holder and purpose."}
          </Text>
          {items.map((photo) => (
            <View key={photo.id} style={s.stack}>
              {photo.canView && (
                <PhotoImage
                  id={photo.id}
                  label="Clinical identification reference"
                  size={120}
                />
              )}
              <Text style={{ color: colors.ink, fontWeight: "600" }}>
                {photo.holder}
              </Text>
              <Text style={{ color: colors.muted }}>{photo.purpose}</Text>
              <Text style={[s.caption, { color: colors.muted }]}>
                {new Date(photo.createdAt).toLocaleString()}
              </Text>
              {!self && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    Alert.alert(
                      "Remove identification photo?",
                      "Remove this locally stored clinical image.",
                      [
                        { text: "Keep photo", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () =>
                            void request(`/photos/${photo.id}`, "DELETE")
                              .then(() => load())
                              .catch((e) => setError(e.message)),
                        },
                      ],
                    )
                  }
                  style={[s.button, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink }}>
                    Remove identification photo
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
          {!items.length && !error && (
            <Text style={{ color: colors.muted }}>
              No clinical identification photo is held here.
            </Text>
          )}
          {error && <Text style={{ color: colors.muted }}>{error}</Text>}
          {!self && !error && (
            <>
              <Text style={{ color: colors.ink }}>Purpose</Text>
              <TextInput
                accessibilityLabel="Identification photo purpose"
                value={purpose}
                maxLength={200}
                onChangeText={setPurpose}
                style={[
                  s.input,
                  { color: colors.ink, borderColor: colors.line },
                ]}
              />
              <View style={s.row}>
                <Text style={{ color: colors.ink, flex: 1 }}>
                  Share with authorized doctors at my organization
                </Text>
                <Switch
                  accessibilityLabel="Organization photo holder"
                  value={scope === "organization"}
                  onValueChange={(v) => setScope(v ? "organization" : "doctor")}
                />
              </View>
              {scope === "doctor" && (
                <Text style={{ color: colors.muted }}>
                  Only you as the treating doctor can view this image.
                </Text>
              )}
              <View style={s.row}>
                <Text style={{ color: colors.ink, flex: 1 }}>
                  I am authorized to collect this photo for the stated care
                  purpose.
                </Text>
                <Switch
                  accessibilityLabel="Authorized to collect identification photo"
                  value={authorized}
                  onValueChange={setAuthorized}
                />
              </View>
              {authorized && (
                <PhotoPicker
                  colors={colors}
                  endpoint={`/patients/${patientId}/identification-photos`}
                  extra={{ purpose, scope, authorized: "true" }}
                  onSaved={() => void load()}
                />
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  stack: { gap: 14 },
  card: { padding: 18, borderRadius: 18, borderWidth: 1, gap: 16 },
  heading: { fontSize: 18, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, alignItems: "center" },
  button: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 13,
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  caption: { fontSize: 12, lineHeight: 19 },
  error: {
    color: "#94291f",
    backgroundColor: "#fff0e9",
    padding: 12,
    borderRadius: 10,
  },
  choice: { minHeight: 48, padding: 13, borderWidth: 1, borderRadius: 10 },
  input: {
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 16,
  },
});
