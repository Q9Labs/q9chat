import { fileSize } from "@q9chat/domain";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useContext, useRef, useState } from "react";
import { Image, View } from "react-native";

import { T } from "../theme/Text";
import type { MessageContent } from "../types";
import { FileCard, VoiceNote } from "./MessageParts";
import { ImageAuthContext } from "./photoAuth";
import { Press } from "./Press";

type Attachment = Extract<MessageContent, { kind: "attachments" }>["files"][number];
function useSource(url: string) {
  const auth = useContext(ImageAuthContext);
  return {
    uri: url,
    ...(auth && url.startsWith(`${auth.origin}/`) ? { headers: auth.headers } : {}),
  };
}

async function privateFile(source: ReturnType<typeof useSource>, name: string) {
  const directory = new Directory(Paths.cache, `q9-share-${randomUUID()}`);
  directory.create();
  const target = new File(directory, name);
  if (source.uri.startsWith("file:")) new File(source.uri).copySync(target);
  else
    await File.downloadFileAsync(
      source.uri,
      target,
      source.headers ? { headers: source.headers } : {},
    );
  return target.uri;
}

function Photo({ file }: { file: Extract<Attachment, { kind: "image" }> }) {
  const source = useSource(file.url);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return (
    <View style={{ maxWidth: "100%" }}>
      <Image
        key={attempt}
        accessibilityLabel="Photo attachment"
        source={source}
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
        style={{
          width: 320,
          maxWidth: "100%",
          aspectRatio: file.width / file.height,
          borderRadius: 14,
        }}
      />
      {failed ? (
        <Press
          accessibilityRole="button"
          accessibilityLabel="Retry photo"
          onPress={() => {
            setFailed(false);
            setAttempt(attempt + 1);
          }}
        >
          <T color="er">Couldn't load photo · Retry</T>
        </Press>
      ) : null}
    </View>
  );
}
function Voice({ file }: { file: Extract<Attachment, { kind: "voice" }> }) {
  const source = useSource(file.url);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const local = useRef<string | null>(null);
  async function load() {
    if (local.current && !status.error) return;
    // The protected endpoint returns a complete file, not AVPlayer byte ranges.
    const uri = await privateFile(source, file.contentType === "audio/mp4" ? "voice.m4a" : "voice");
    local.current = uri;
    player.replace({ uri });
  }
  async function toggle() {
    if (busy.current) return;
    if (status.playing) {
      player.pause();
      return;
    }
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      await load();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration))
        await player.seekTo(0);
      player.play();
    } catch {
      local.current = null;
      setError("Couldn't play voice note. Try again.");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  return (
    <View style={{ maxWidth: "100%" }}>
      <VoiceNote
        durationSeconds={Math.round(file.durationMs / 1000)}
        waveform={file.waveform}
        playing={status.playing}
        progress={status.duration > 0 ? status.currentTime / status.duration : 0}
        onTogglePlay={() => void toggle()}
      />
      {error || status.error ? (
        <T color="er">Couldn't play voice note · Tap Play to retry.</T>
      ) : null}
      {loading ? <T color="mu">Loading voice note…</T> : null}
    </View>
  );
}
function Download({ file }: { file: Extract<Attachment, { kind: "file" }> }) {
  const source = useSource(file.url);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");
  async function open() {
    if (state === "loading") return;
    setState("loading");
    try {
      const name =
        file.name.replace(/[^\p{L}\p{N} ._-]/gu, "_").replace(/^\.+$/u, "attachment") ||
        "attachment";
      const uri = await privateFile(source, name);
      // Android's chooser can resolve before the receiving app reads the file. Sign-out clears this private cache.
      await Sharing.shareAsync(uri, { mimeType: file.contentType, dialogTitle: file.name });
      setState("idle");
    } catch {
      setState("failed");
    }
  }
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`Open ${file.name}`}
      onPress={() => void open()}
    >
      <FileCard name={file.name} size={fileSize(file.size)} />
      {state !== "idle" ? (
        <T color={state === "failed" ? "er" : "mu"}>
          {state === "failed" ? "Couldn't open file · Tap to retry" : "Opening file…"}
        </T>
      ) : null}
    </Press>
  );
}
export function LiveAttachments({
  files,
}: {
  files: Extract<MessageContent, { kind: "attachments" }>["files"];
}) {
  return (
    <View style={{ maxWidth: "100%", gap: 4 }}>
      {files.map((file) =>
        file.kind === "image" ? (
          <Photo key={file.url} file={file} />
        ) : file.kind === "voice" ? (
          <Voice key={file.url} file={file} />
        ) : (
          <Download key={file.url} file={file} />
        ),
      )}
    </View>
  );
}
