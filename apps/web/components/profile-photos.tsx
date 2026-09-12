/* eslint-disable @next/next/no-img-element -- Authenticated local photo endpoints use session cookies. */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export type Photo = {
  id: string;
  imageUrl: string | null;
  createdAt: string;
  holder: string;
  holderScope: string;
  purpose: string;
  canView: boolean;
};
export function ProfileAvatar({
  owner,
  name,
  size = 44,
}: {
  owner: string;
  name: string;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void api<{ photo: Photo | null }>(`/profiles/${owner}`)
        .then((r) => {
          if (alive) setUrl(r.photo?.imageUrl || null);
        })
        .catch(() => {
          if (alive) setUrl(null);
        });
    load();
    const interval = setInterval(load, 30000);
    window.addEventListener("profile-photo-changed", load);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("profile-photo-changed", load);
    };
  }, [owner]);
  return (
    <span className="profile-avatar" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt={`${name} profile`} onError={() => setUrl(null)} />
      ) : (
        <span aria-hidden>
          {name
            .split(" ")
            .slice(0, 2)
            .map((n) => n[0])
            .join("")}
        </span>
      )}
    </span>
  );
}
export function PhotoPicker({
  endpoint = "/profile/photo",
  extra = {},
  onSaved,
}: {
  endpoint?: string;
  extra?: Record<string, string>;
  onSaved?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState(false),
    [cameraReady, setCameraReady] = useState(false),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(
    () => () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function upload(file: Blob) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a JPEG or PNG under 5 MB.");
      const form = new FormData();
      form.append("file", file, "portrait.jpg");
      for (const [k, v] of Object.entries(extra)) form.append(k, v);
      await api(endpoint, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(45000),
      });
      setPreview(onSaved ? "" : URL.createObjectURL(file));
      setMessage("Photo saved locally. Face presence checked.");
      window.dispatchEvent(new Event("profile-photo-changed"));
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save photo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function choose(file: File) {
    // Browser decoding honors camera orientation before the server strips metadata again.
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a JPEG or PNG under 5 MB.");
      return;
    }
    const object = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = object;
      await image.decode();
      if (image.naturalWidth * image.naturalHeight > 20_000_000)
        throw new Error("Choose a photo under 20 megapixels.");
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        1024 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo preparation is unavailable.");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Choose a different photo.");
      await upload(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read photo");
    } finally {
      URL.revokeObjectURL(object);
    }
  }
  async function openCamera() {
    setError("");
    setBusy(true);
    setCameraReady(false);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = media;
      setCamera(true);
    } catch {
      setError(
        "Camera access was unavailable. Allow camera access or choose a photo.",
      );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const attachVideo = useCallback((element: HTMLVideoElement | null) => {
    video.current = element;
    if (element && stream.current) {
      element.srcObject = stream.current;
      void element.play().catch(() => undefined);
    }
  }, []);
  function closeCamera() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setCameraReady(false);
    setCamera(false);
  }
  function capture() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")?.drawImage(v, 0, 0);
    c.toBlob(
      (blob) => {
        closeCamera();
        if (blob) void upload(blob);
      },
      "image/jpeg",
      0.9,
    );
  }
  return (
    <div className="photo-picker">
      {preview && (
        <img
          className="photo-preview"
          src={preview}
          alt="Your selected portrait"
        />
      )}
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png"
        aria-label="Upload profile photo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void choose(f);
        }}
        disabled={busy}
      />
      <div className="photo-actions">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} />
          Choose photo
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void openCamera()}
        >
          <Camera size={16} />
          Take photo
        </Button>
      </div>
      <p className="muted">
        One clear face · JPEG/PNG · up to 5 MB. Checked on this computer,
        without cloud analysis. This does not verify identity or liveness.
      </p>
      {busy && <p role="status">Checking and saving your photo…</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="photo-success">
          {message}
        </p>
      )}
      <Dialog
        open={camera}
        onOpenChange={(v) => {
          if (!v) closeCamera();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take a profile photo</DialogTitle>
            <DialogDescription>
              Face the camera in good light. Only one person should be visible.
            </DialogDescription>
          </DialogHeader>
          <video
            ref={attachVideo}
            onLoadedMetadata={() => setCameraReady(true)}
            muted
            autoPlay
            playsInline
            className="camera-preview"
          />
          <Button disabled={!cameraReady} onClick={capture}>
            Use this photo
          </Button>
          <Button variant="outline" onClick={closeCamera}>
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function ProfilePanel({
  id,
  name,
  patient,
}: {
  id: string;
  name: string;
  patient: boolean;
}) {
  const [policy, setPolicy] = useState("none"),
    [names, setNames] = useState(""),
    [photo, setPhoto] = useState<Photo | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      api<{
        visibility: string;
        viewers: { username: string }[];
        photo: Photo | null;
      }>("/profile")
        .then((p) => {
          setPolicy(p.visibility);
          setNames(p.viewers.map((v) => v.username).join(", "));
          setPhoto(p.photo);
        })
        .catch((e) =>
          setError(e instanceof Error ? e.message : "Unable to load profile"),
        ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/profile/visibility", {
        method: "PUT",
        body: {
          visibility: policy,
          usernames: names
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean),
        },
      });
      setNotice(
        "Profile visibility saved. Medical sharing permissions are separate.",
      );
      window.dispatchEvent(new Event("profile-photo-changed"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="profile-layout">
      <section className="panel profile-panel">
        <div className="profile-identity">
          <ProfileAvatar owner={id} name={name} size={88} />
          <div>
            <h2>{name}</h2>
            <p className="muted">Your profile photo</p>
          </div>
        </div>
        <PhotoPicker key={photo?.id || "empty"} onSaved={() => void load()} />
        {photo && (
          <Button
            variant="outline"
            onClick={async () => {
              if (!window.confirm("Remove your profile photo?")) return;
              try {
                await api("/profile/photo", { method: "DELETE" });
                setPhoto(null);
                window.dispatchEvent(new Event("profile-photo-changed"));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to remove");
              }
            }}
          >
            Remove profile photo
          </Button>
        )}
      </section>
      <section className="panel profile-panel">
        <h2>Who can see your photo?</h2>
        <label htmlFor="photo-visibility">Profile visibility</label>
        <select
          id="photo-visibility"
          value={policy}
          onChange={(e) => {
            setPolicy(e.target.value);
            setNotice("");
          }}
        >
          <option value="none">Nobody — only me</option>
          <option value="care_team">My authorized care team</option>
          <option value="selected">Selected people</option>
          <option value="signed_in">Public — signed-in users</option>
        </select>
        {policy === "selected" && (
          <>
            <label htmlFor="photo-recipients">Selected account usernames</label>
            <Input
              id="photo-recipients"
              value={names}
              onChange={(e) => setNames(e.target.value)}
              placeholder="alex, jordan"
            />
            <p className="muted">
              Choose existing accounts, separated by commas. This shares the
              photo only.
            </p>
          </>
        )}
        {policy === "signed_in" && (
          <p className="muted">
            Any signed-in account with your profile reference can see this
            photo. It is not published on the open internet.
          </p>
        )}
        <Button disabled={busy} onClick={() => void save()}>
          Save visibility
        </Button>
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
      </section>
      {patient && <ClinicalPhotos patientId={id} self />}
    </div>
  );
}
export function ClinicalPhotos({
  patientId,
  self = false,
}: {
  patientId: string;
  self?: boolean;
}) {
  const [items, setItems] = useState<Photo[]>([]),
    [error, setError] = useState(""),
    [purpose, setPurpose] = useState("Patient identification during care"),
    [scope, setScope] = useState("organization"),
    [authorized, setAuthorized] = useState(false);
  const generation = useRef(0);
  const load = useCallback(() => {
    const current = ++generation.current;
    return api<Photo[]>(`/patients/${patientId}/identification-photos`)
      .then((items) => {
        if (current === generation.current) {
          setItems(items);
          setError("");
        }
      })
      .catch((e) => {
        if (current === generation.current) {
          setItems([]);
          setError(
            e instanceof Error
              ? e.message
              : "Unable to load identification photos",
          );
        }
      });
  }, [patientId]);
  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30000);
    const pending = generation;
    return () => {
      pending.current++;
      clearInterval(interval);
    };
  }, [load]);
  return (
    <section className="panel profile-panel clinical-photo-panel">
      <h2>
        {self
          ? "Clinical identification photos held for you"
          : "Clinical identification photo"}
      </h2>
      <p className="muted">
        {self
          ? "These are separate from your profile photo. Only the authorized clinical holder can view the image; you can see who holds it and the stated purpose."
          : "Private to the selected holder. The patient can see the holder and purpose. Existing document-sharing permission is required."}
      </p>
      {items.map((p) => (
        <article className="clinical-photo-item" key={p.id}>
          {p.imageUrl && (
            <img src={p.imageUrl} alt="Clinical identification reference" />
          )}
          <div>
            <strong>{p.holder}</strong>
            <p>{p.purpose}</p>
            <small>{new Date(p.createdAt).toLocaleString()}</small>
            {!self && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Remove this clinical identification photo?",
                    )
                  )
                    return;
                  try {
                    await api(`/photos/${p.id}`, { method: "DELETE" });
                    await load();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Unable to remove",
                    );
                  }
                }}
              >
                Remove identification photo
              </Button>
            )}
          </div>
        </article>
      ))}
      {!items.length && !error && (
        <p>No clinical identification photo is held here.</p>
      )}
      {error && (
        <p role="status" className="muted">
          {error}
        </p>
      )}
      {!self && !error && (
        <>
          <label>
            Purpose
            <Input
              aria-label="Identification photo purpose"
              value={purpose}
              maxLength={200}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          <label>
            Clinical holder
            <select
              aria-label="Clinical photo holder"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="organization">
                Authorized doctors at my organization
              </option>
              <option value="doctor">Only me as the treating doctor</option>
            </select>
          </label>
          <label className="photo-authorization">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            I am authorized to collect this photo for the stated care purpose.
          </label>
          {authorized && (
            <PhotoPicker
              endpoint={`/patients/${patientId}/identification-photos`}
              extra={{ purpose, scope, authorized: "true" }}
              onSaved={() => void load()}
            />
          )}
        </>
      )}
    </section>
  );
}
