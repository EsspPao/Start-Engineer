import { useEffect, useMemo, useRef, useState } from "react";
import type { DiscoveredAppCandidate, EverythingSearchResult, InstallableAppCandidate, InternalSearchResult, StartEngineerApi } from "../shared/types";
import { cleanErrorMessage } from "./error-message";
import { buildInternalSearchResults } from "./search";
import { buildSearchableAppIdentityKey } from "./search-panel-behavior";
import type { RuntimeApp } from "./window-focus-feedback";

type UseSearchResultsOptions = {
  client: StartEngineerApi;
  runtimeApps: RuntimeApp[];
};

export function useSearchResults({ client, runtimeApps }: UseSearchResultsOptions) {
  const [query, setQuery] = useState("");
  const [discoveredResults, setDiscoveredResults] = useState<DiscoveredAppCandidate[]>([]);
  const [installableResults, setInstallableResults] = useState<InstallableAppCandidate[]>([]);
  const [fileResults, setFileResults] = useState<EverythingSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const searchRequest = useRef(0);
  const runtimeAppsRef = useRef(runtimeApps);
  runtimeAppsRef.current = runtimeApps;

  const managedSearchResults = useMemo(
    () => buildInternalSearchResults(query, runtimeApps),
    [query, runtimeApps],
  );
  const searchableAppIdentityKey = useMemo(() => buildSearchableAppIdentityKey(runtimeApps), [runtimeApps]);
  const appSearchResultCount = managedSearchResults.length + discoveredResults.length + installableResults.length;
  const searchResultCount = appSearchResultCount || searchLoading ? appSearchResultCount : fileResults.length;

  useEffect(() => {
    const trimmed = query.trim();
    setSearchSelectedIndex(0);
    if (!trimmed) {
      setDiscoveredResults([]);
      setInstallableResults([]);
      setFileResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    setSearchPanelOpen(true);
    setSearchLoading(true);
    setSearchError("");
    const requestId = ++searchRequest.current;
    const timer = window.setTimeout(() => {
      void Promise.all([client.searchAppCandidates(trimmed), client.searchInstallableApps(trimmed)])
        .then(([results, installable]) => {
          if (searchRequest.current !== requestId) return;
          setDiscoveredResults(results);
          setInstallableResults(installable);
          const hasManagedResults = buildInternalSearchResults(trimmed, runtimeAppsRef.current).length > 0;
          if (results.length || installable.length || hasManagedResults) {
            setFileResults([]);
            setSearchLoading(false);
            return;
          }
          void client.searchEverything(trimmed)
            .then((files) => {
              if (searchRequest.current !== requestId) return;
              setFileResults(files.slice(0, 20));
              setSearchLoading(false);
            })
            .catch((reason) => {
              if (searchRequest.current !== requestId) return;
              setFileResults([]);
              setSearchLoading(false);
              setSearchError(cleanErrorMessage(reason, "Everything 搜索失败"));
            });
        })
        .catch((reason) => {
          if (searchRequest.current !== requestId) return;
          setDiscoveredResults([]);
          setInstallableResults([]);
          setFileResults([]);
          setSearchLoading(false);
          setSearchError(cleanErrorMessage(reason, "搜索本机应用失败"));
        });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [client, query, searchableAppIdentityKey]);

  useEffect(() => {
    if (query.trim()) setSearchPanelOpen(true);
  }, [query]);

  return {
    discoveredResults,
    fileResults,
    installableResults,
    managedSearchResults,
    query,
    searchError,
    searchLoading,
    searchPanelOpen,
    searchResultCount,
    searchSelectedIndex,
    setDiscoveredResults,
    setFileResults,
    setInstallableResults,
    setQuery,
    setSearchPanelOpen,
    setSearchSelectedIndex,
  };
}
