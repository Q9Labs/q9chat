import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { defaultWorld, infoOf } from "../../../src/fixtures/build";
import { useToast } from "../../../src/kit/useToast";
import { InfoScreen, type InfoSheet } from "../../../src/screens/InfoScreen";
import type { Notify } from "../../../src/types";

// Fixture data stands in until the wiring lane maps `groups.get` onto the same props.
const world = defaultWorld();

export default function InfoRoute() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const [sheet, setSheet] = useState<InfoSheet | null>(null);
  const [notify, setNotify] = useState<Notify | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, showToast] = useToast();
  const base = infoOf(groupId, world);
  const close = () => setSheet(null);

  return (
    <InfoScreen
      info={{ status: "member", ...base, notify: notify ?? base.notify }}
      sheet={sheet}
      copied={copied}
      toast={toast}
      onBack={() => router.back()}
      onAddPeople={() => router.push("/new-group")}
      onCopyLink={() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      onSearch={() => router.push("/search")}
      onOpenNotify={() => setSheet({ type: "notify" })}
      onChooseNotify={(next) => {
        setNotify(next);
        close();
        showToast(next === "muted" ? `${base.title} is muted` : `Notifications: ${next === "all" ? "all messages" : "mentions and replies"}`);
      }}
      onToggleMute={(muted) => {
        setNotify(muted ? "muted" : "mentions");
        showToast(muted ? `${base.title} is muted` : `${base.title} is unmuted`);
      }}
      onOpenMember={(personId) => setSheet({ type: "member", personId })}
      onMessageMember={() => {
        close();
        router.back();
      }}
      onAskRemove={(personId) => setSheet({ type: "removeMember", personId })}
      onConfirmRemove={close}
      onAskLeave={() => setSheet({ type: "leave" })}
      onConfirmLeave={() => router.replace("/")}
      onCloseSheet={close}
    />
  );
}
