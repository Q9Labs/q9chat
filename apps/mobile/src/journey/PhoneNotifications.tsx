import { api } from "@q9chat/convex";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";

import { useToast } from "../kit/useToast";
import { notificationTarget, showPhoneNotification } from "./notificationTarget";
import { phoneWrite } from "./phoneWrite";
import { useStage } from "./useStage";

let viewingPath: string | null = null;
let signedIn = false;
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const show = signedIn && showPhoneNotification(notification.request.content.data, viewingPath);
    return {
      shouldShowBanner: show,
      shouldShowList: show,
      shouldPlaySound: show,
      shouldSetBadge: false,
    };
  },
});

type PhonePush = {
  banner: boolean;
  notice: string | null;
  turnOn: () => void;
  notNow: () => void;
  unregister: () => Promise<void>;
  resume: () => void;
};
const PushContext = createContext<PhonePush | null>(null);
const tokenKey = "q9chat.expoPushToken";
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

async function expoToken(projectId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Notifications.getExpoPushTokenAsync({ projectId }),
      new Promise<Notifications.ExpoPushToken>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Push registration timed out")), 15_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function registerToken(isCurrent: () => boolean) {
  const projectId = Constants.easConfig?.projectId;
  if (!projectId) throw new Error("Push project is not configured");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
    });
  const token = await expoToken(projectId);
  if (!isCurrent()) return false;
  // Persist before the write: sign-out must be able to remove a registration after a lost response.
  await SecureStore.setItemAsync(tokenKey, token.data, options);
  await phoneWrite((client) =>
    client.mutation(api.devices.registerExpo, { expoPushToken: token.data }),
  );
  return true;
}

export function usePhoneNotifications() {
  const value = useContext(PushContext);
  if (!value) throw new Error("Phone notifications need PhoneNotificationsProvider");
  return value;
}

export function PhoneNotificationsProvider({ children }: { children: ReactNode }) {
  const stage = useStage();
  const profileId = stage.kind === "ready" ? stage.profile.id : null;
  const [bannerFor, setBannerFor] = useState<string | null>(null);
  const banner = profileId !== null && bannerFor === profileId;
  const setBanner = useCallback(
    (show: boolean) => setBannerFor(show ? profileId : null),
    [profileId],
  );
  const [notice, setNotice] = useToast();
  const lifecycle = useRef<{
    paused: boolean;
    pending: Promise<void> | null;
    asking: boolean;
    profileId: string | null;
  }>({ paused: false, pending: null, asking: false, profileId });
  useEffect(() => {
    lifecycle.current.profileId = profileId;
    lifecycle.current.paused = false;
  }, [profileId]);
  useVisibleConversation(profileId);
  useNotificationTap(profileId, setNotice);

  const register = useCallback(() => {
    if (!profileId || lifecycle.current.paused) return Promise.resolve();
    if (lifecycle.current.pending) return lifecycle.current.pending;
    const work = registerToken(
      () => !lifecycle.current.paused && lifecycle.current.profileId === profileId,
    ).then((registered) => {
      if (registered) setBanner(false);
    });
    const pending = work.finally(() => {
      lifecycle.current.pending = null;
    });
    lifecycle.current.pending = pending;
    return pending;
  }, [profileId, setBanner]);

  useEffect(() => {
    const lifetime = new AbortController();
    const live = () => !lifetime.signal.aborted;
    async function sync() {
      if (!profileId) return;
      const permissions = await Notifications.getPermissionsAsync();
      if (!live() || lifecycle.current.paused) return;
      if (permissions.granted) await register();
      else {
        const dismissed = await SecureStore.getItemAsync(
          `q9chat.pushDismissed.${profileId}`,
          options,
        );
        if (live()) setBanner(dismissed !== "yes");
      }
    }
    const run = () =>
      void sync().catch(() => {
        if (live() && !lifecycle.current.paused) {
          setBanner(true);
          setNotice("Couldn't turn on notifications. Try again when you're connected.");
        }
      });
    run();
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    const changed = Notifications.addPushTokenListener(() => run());
    return () => {
      lifetime.abort();
      foreground.remove();
      changed.remove();
    };
  }, [profileId, register, setNotice, setBanner]);

  const value = useMemo<PhonePush>(() => {
    async function turnOn() {
      if (!profileId || lifecycle.current.asking) return;
      lifecycle.current.asking = true;
      setNotice(null);
      try {
        if (Platform.OS === "android")
          await Notifications.setNotificationChannelAsync("default", {
            name: "Messages",
            importance: Notifications.AndroidImportance.HIGH,
          });
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.granted) {
          await register();
          setNotice("Notifications are on");
        } else {
          await SecureStore.setItemAsync(`q9chat.pushDismissed.${profileId}`, "yes", options);
          setBanner(false);
          setNotice("You can turn them on later in Settings");
        }
      } catch {
        setBanner(true);
        setNotice("Couldn't turn on notifications. Try again when you're connected.");
      } finally {
        lifecycle.current.asking = false;
      }
    }

    async function unregister() {
      lifecycle.current.paused = true;
      signedIn = false;
      // A registration started before Sign out must finish before its deletion.
      await lifecycle.current.pending?.catch(() => {});
      const token = await SecureStore.getItemAsync(tokenKey, options);
      if (token) {
        await phoneWrite((client) =>
          client.mutation(api.devices.unregister, { expoPushToken: token }),
        );
        await SecureStore.deleteItemAsync(tokenKey, options);
      }
      Notifications.clearLastNotificationResponse();
      await Notifications.dismissAllNotificationsAsync();
    }

    const notNow = () => {
      if (!profileId) return;
      setBanner(false);
      void SecureStore.setItemAsync(`q9chat.pushDismissed.${profileId}`, "yes", options).catch(
        () => {
          setBanner(true);
          setNotice("Couldn't save your choice. Try again.");
        },
      );
    };
    return {
      banner,
      notice,
      turnOn: () => void turnOn(),
      notNow,
      unregister,
      resume: () => {
        lifecycle.current.paused = false;
        signedIn = lifecycle.current.profileId !== null;
        void Notifications.getPermissionsAsync()
          .then(async (permission) => {
            if (permission.granted) await register();
          })
          .catch(() => {
            setBanner(true);
            setNotice("Couldn't turn on notifications. Try again when you're connected.");
          });
      },
    };
  }, [banner, notice, profileId, register, setBanner, setNotice]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

function useVisibleConversation(profileId: string | null) {
  const path = usePathname();
  useEffect(() => {
    signedIn = profileId !== null;
    const update = () => {
      viewingPath = profileId && AppState.currentState === "active" ? path : null;
    };
    update();
    const listener = AppState.addEventListener("change", update);
    return () => {
      listener.remove();
      viewingPath = null;
      signedIn = false;
    };
  }, [path, profileId]);
}

function useNotificationTap(profileId: string | null, setNotice: (text: string | null) => void) {
  const router = useRouter();
  const navigation = useRootNavigationState();
  const opened = useRef<string | null>(null);
  const canOpen = profileId !== null && Boolean(navigation.key);
  useEffect(() => {
    let live = true;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (
        !live ||
        !canOpen ||
        response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
      )
        return;
      if (opened.current === response.notification.request.identifier) return;
      opened.current = response.notification.request.identifier;
      const target = notificationTarget(response.notification.request.content.data);
      Notifications.clearLastNotificationResponse();
      if (!target) return;
      router.push({ pathname: "/g/[groupId]", params: target });
      void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(
        () => setNotice("Couldn't clear the notification."),
      );
    };
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    open(Notifications.getLastNotificationResponse());
    return () => {
      live = false;
      listener.remove();
    };
  }, [canOpen, router, setNotice]);
}
