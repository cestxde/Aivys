import { ContextMenu } from "../components/ContextMenu/ContextMenu";
import { CoverCropDialog } from "../components/CoverCropDialog/CoverCropDialog";
import { MiniPlayer } from "../components/MobilePlayer/MiniPlayer";
import { NowPlaying, PhoneSheet } from "../components/MobilePlayer/NowPlaying";
import { PlayerBar } from "../components/PlayerBar/PlayerBar";
import { t } from "../i18n";
import type { LibraryAppShellProps } from "./libraryShellProps";

export function LibraryDesktopPanel(props: LibraryAppShellProps) {
	const { isPhone, panelTab, setPanelTab, queuePanel, detailPanel, queue, t: translate } = props;
	if (isPhone) return null;

	return (
		<aside className={`track-detail-panel ${panelTab === "queue" ? "overlay" : ""}`}>
			<div className="panel-tabs" role="tablist">
				<button
					role="tab"
					aria-selected={panelTab === "track"}
					className={`panel-tab ${panelTab === "track" ? "active" : ""}`}
					onClick={() => setPanelTab("track")}
				>
					{translate("panel.track")}
				</button>
				<button
					role="tab"
					aria-selected={panelTab === "queue"}
					className={`panel-tab ${panelTab === "queue" ? "active" : ""}`}
					onClick={() => setPanelTab("queue")}
				>
					{translate("queue.next")}
					<span className="panel-tab-count">{Math.max(0, queue.order.length - queue.index - 1)}</span>
				</button>
			</div>
			{panelTab === "queue" ? queuePanel : detailPanel}
		</aside>
	);
}

export function LibraryPlayerChrome(props: LibraryAppShellProps) {
	const {
		isPhone, currentTrack, phoneSelecting, isPlaying, togglePlay, onPrev, onNext, nowPlayingOpen,
		setNowPlayingOpen, queue, trackStats, tags, element, isShuffle, repeatMode, seek, toggleShuffle,
		toggleRepeatMode, sleep, setAddTo, setTagPicker, copyTrackTags, pasteTrackTags, addTrackTags,
		liveClipboardTags, leavePlayer, showView, listView, previousTrack, goToEntries, setMenu, setPhonePanel,
		phonePanel, queuePanel, detailPanel, canOpenArtist, openArtist, volume, setVolume, panelTab, setPanelTab,
		menu, closeMenu,
	} = props;

	return (
		<>
			{isPhone ? (
				<>
					{currentTrack && !phoneSelecting && (
						<MiniPlayer
							track={currentTrack}
							isPlaying={isPlaying}
							onTogglePlay={togglePlay}
							onPrev={onPrev}
							onNext={onNext}
							onOpen={() => setNowPlayingOpen(true)}
						/>
					)}
					{currentTrack && nowPlayingOpen && (
						<NowPlaying
							track={currentTrack}
							previous={queue.order.length > 1 ? queue.order[(queue.index - 1 + queue.order.length) % queue.order.length] : null}
							next={queue.order.length > 1 ? queue.order[(queue.index + 1) % queue.order.length] : null}
							stats={trackStats.stats[currentTrack.relPath] ?? null}
							tagsById={tags.byId}
							element={element}
							isPlaying={isPlaying}
							isShuffle={isShuffle}
							repeatMode={repeatMode}
							upcoming={Math.max(0, queue.order.length - queue.index - 1)}
							onClose={() => setNowPlayingOpen(false)}
							onTogglePlay={togglePlay}
							onPrev={onPrev}
							onNext={onNext}
							onSeek={seek}
							onToggleShuffle={toggleShuffle}
							onToggleRepeat={toggleRepeatMode}
							onToggleFavorite={trackStats.toggleFavorite}
							onAddTo={(track) => setAddTo([track])}
							onEditTags={(track) => setTagPicker([track])}
							onCopyTags={copyTrackTags}
							onPasteTags={(track) => pasteTrackTags([track])}
							onAddTags={(track) => addTrackTags([track])}
							hasTagClipboard={liveClipboardTags().length > 0}
							onOpenTag={(target) => {
								leavePlayer();
								showView({ kind: "tag", id: target.id }, listView);
							}}
							onRemoveTag={(track, target) => trackStats.setTrackTag([track], target.id, false)}
							onSwipePrevious={previousTrack}
							sleepTimer={sleep.timer}
							onSleepTimerChange={sleep.setTimer}
							canGoTo={goToEntries(currentTrack, true).length > 0}
							onOpenGoTo={(track, x, y) => setMenu({
								x,
								y,
								entries: goToEntries(track, true)
									.filter(entry => entry.kind !== "separator")
									.map(entry => entry.kind === "item" ? {
										...entry,
										onSelect: () => {
											leavePlayer();
											entry.onSelect();
										},
									} : entry),
							})}
							onOpenQueue={() => setPhonePanel("queue")}
							onOpenDetails={() => setPhonePanel("track")}
							canOpenArtist={canOpenArtist}
							onOpenArtist={(name) => {
								leavePlayer();
								openArtist(name);
							}}
						/>
					)}
					{phonePanel && (
						<PhoneSheet
							title={phonePanel === "queue" ? t("player.queue") : t("panel.track")}
							onBack={() => setPhonePanel(null)}
						>
							{phonePanel === "queue" ? queuePanel : detailPanel}
						</PhoneSheet>
					)}
				</>
			) : (
				<PlayerBar
					currentTrack={currentTrack ?? null}
					canOpenArtist={canOpenArtist}
					onOpenArtist={openArtist}
					isPlaying={isPlaying}
					volume={volume}
					onTogglePlay={togglePlay}
					onVolumeChange={setVolume}
					onPrev={onPrev}
					onNext={onNext}
					element={element}
					onSeek={seek}
					isShuffle={isShuffle}
					repeatMode={repeatMode}
					onToggleShuffle={toggleShuffle}
					queueOpen={panelTab === "queue"}
					sleepTimer={sleep.timer}
					onSleepTimerChange={sleep.setTimer}
					onToggleQueue={() => setPanelTab(panelTab === "queue" ? "track" : "queue")}
					onToggleRepeat={toggleRepeatMode}
				/>
			)}

			{menu && (
				<ContextMenu x={menu.x} y={menu.y} entries={menu.entries} onClose={closeMenu} />
			)}

			<CoverCropDialog />
		</>
	);
}
