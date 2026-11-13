import "./App.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { LibraryPicker } from "./components/LibraryPicker/LibraryPicker";
import { ThemedLogo } from "./components/ThemedLogo";
import { Notices } from "./components/Notices/Notices";
import { useLibrary } from "./hooks/useLibrary";
import { usePlayerSettings } from "./hooks/usePlayerSettings";
import { useTheme } from "./hooks/useTheme";
import { useLibraryAppModel } from "./hooks/useLibraryAppModel";
import { LibraryAppShell } from "./app/LibraryAppShell";
import { checkForUpdates } from "./utils/updates";
import { t } from "./i18n";
import { addRecentPath, removeRecentPath } from "./types";
import { type Screen } from "./app/types";

function App() {
	const { settings, updateSettings } = usePlayerSettings();
	const { theme, setTheme } = useTheme();
	const library = useLibrary();
	const [view, setView] = useState<Screen>("loading");
	const [pickerError, setPickerError] = useState<string | null>(null);

	const goToPickerRef = useRef<() => void>(() => {});
	const goToPicker = useCallback(() => goToPickerRef.current(), []);

	const { shellProps, stop, resume, recordMissedPlays } = useLibraryAppModel({
		library,
		settings,
		updateSettings,
		theme,
		setTheme,
		view,
		goToPicker,
	});

	goToPickerRef.current = () => {
		stop();
		setView("picker");
	};

	// Open a folder as the active library: validate it, remember it, scan it.
	const openLibrary = async (path: string) => {
		const valid = await library.validate(path);
		if (!valid) {
			setPickerError(t("picker.folderNotFound", { path }));
			return;
		}
		setPickerError(null);
		stop();
		updateSettings({
			lastPath: path,
			recentPaths: addRecentPath(settings.recentPaths, path),
		});
		setView("library");
		await library.scan(path);
	};

	const handleRemoveRecent = (path: string) => {
		const recentPaths = removeRecentPath(settings.recentPaths, path);
		// If the removed folder was the one we'd reopen on startup, forget it too,
		// so the next launch won't auto-open a folder the user removed.
		const lastPath = path === settings.lastPath ? "" : settings.lastPath;
		updateSettings({ recentPaths, lastPath });
	};

	// On startup: reopen the last folder if it still exists, otherwise stay on
	// the picker (showing an error if a previously used folder disappeared).
	// Once only: StrictMode mounts twice in development, and a second scan would
	// redo the whole work.
	const started = useRef(false);
	useEffect(() => {
		if (started.current) return;
		started.current = true;
		const last = settings.lastPath;
		(async () => {
			if (last) {
				const valid = await library.validate(last);
				if (valid) {
					// The library as the last scan left it shows at once; the
					// folder is checked meanwhile, and what changed shows after.
					const indexed = await library.loadIndexed(last);
					if (indexed) {
						resume(indexed);
						recordMissedPlays(indexed);
						setView("library");
						library.scan(last, { background: true });
						return;
					}
					const scanned = await library.scan(last) ?? [];
					resume(scanned);
					recordMissedPlays(scanned);
					setView("library");
					return;
				}
				setPickerError(t("picker.lastGone", { path: last }));
			}
			resume([]);
			setView("picker");
		})();
		// Run once on mount.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// A new version on GitHub: looked for quietly once, as soon as the app has
	// started (the library loaded, or the folder picker shown without one).
	const updatesChecked = useRef(false);
	useEffect(() => {
		if (view === "loading" || updatesChecked.current) return;
		updatesChecked.current = true;
		checkForUpdates({ manual: false });
	}, [view]);

	// Show the loading screen while the initial folder is being resolved or a
	// scan is in progress (startup or switching libraries). The track list is
	// never shown during a scan.
	if (view === "loading" || library.isLoading) {
		return (
			<main className="container loading-screen">
				<ThemedLogo className="loading-logo" />
				{library.isLoading && (
					<div className="loading-status">
						<div className="spinner" aria-hidden="true" />
						<span>{t("loading.indexing")}</span>
					</div>
				)}
				<Notices />
			</main>
		);
	}

	if (view === "picker") {
		return (
			<main className="container">
				<header className="header">
					<div className="logo-wrapper">
						<ThemedLogo className="app-logo" />
					</div>
				</header>
				<LibraryPicker
					recentPaths={settings.recentPaths}
					error={pickerError}
					onOpen={openLibrary}
					onRemoveRecent={handleRemoveRecent}
				/>
				<Notices />
			</main>
		);
	}

	return <LibraryAppShell {...shellProps} />;
}

export default App;
