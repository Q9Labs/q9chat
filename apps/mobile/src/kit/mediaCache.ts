const prefix = (profile: string, group: string) => `q9-media-${profile}-${group}-`;

/** App-owned downloads share the membership's lifetime, including writes still in flight. */
export function createMediaCache(storage: {
  names: () => string[];
  remove: (name: string) => void;
}) {
  const scopes = new Map<object, { profile: string; group: string; retire: () => void }>();
  function erase(matches: (name: string) => boolean) {
    for (const name of storage.names()) {
      if (matches(name) || name.startsWith("q9-share-")) storage.remove(name);
    }
  }
  function retire(matches: (scope: { profile: string; group: string }) => boolean) {
    for (const [key, scope] of scopes) {
      if (matches(scope)) {
        scope.retire();
        scopes.delete(key);
      }
    }
  }
  return {
    open(profile: string, group: string) {
      let active = true;
      const key = {};
      // Each mounted history owns a handle; removing one group retires every handle for it.
      const assertActive = () => {
        if (!active) throw new Error("Private media is no longer available");
      };
      scopes.set(key, {
        profile,
        group,
        retire: () => {
          active = false;
        },
      });
      return {
        async download(id: string, write: (directory: string) => Promise<string>) {
          assertActive();
          const directory = `${prefix(profile, group)}${id}`;
          try {
            const uri = await write(directory);
            assertActive();
            return { uri, assertActive };
          } catch (error) {
            storage.remove(directory);
            throw error;
          }
        },
      };
    },
    clearGroup(profile: string, group: string) {
      retire((scope) => scope.profile === profile && scope.group === group);
      erase((name) => name.startsWith(prefix(profile, group)));
    },
    retainGroups(profile: string, groups: readonly string[]) {
      retire((scope) => scope.profile === profile && !groups.includes(scope.group));
      erase(
        (name) =>
          name.startsWith(`q9-media-${profile}-`) &&
          !groups.some((group) => name.startsWith(prefix(profile, group))),
      );
    },
    clearAccount() {
      retire(() => true);
      erase((name) => name.startsWith("q9-media-"));
    },
  };
}
