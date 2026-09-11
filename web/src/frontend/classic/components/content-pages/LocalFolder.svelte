<script lang="ts">
    import { Button, InlineLoading, InlineNotification } from 'carbon-components-svelte';
    import FolderIcon from 'carbon-icons-svelte/lib/Folder.svelte';
    import ViewIcon from 'carbon-icons-svelte/lib/View.svelte';
    import TranslateIcon from 'carbon-icons-svelte/lib/Translate.svelte';
    import { PickLocalDirectory, type LocalFolderHandle } from '../../../../engine/platform/LocalFolder';
    import { LocalChapter } from '../../../../engine/providers/LocalMedia';
    import { TranslateWorkspace } from '../../stores/TranslateWorkspace.svelte';
    import { Store as UI } from '../../stores/Stores.svelte';
    import { GlobalSettings } from '../../stores/Settings.svelte';
    import Image from '../viewer/Image.svelte';

    const L = GlobalSettings.Locale;

    let folder: LocalFolderHandle | null = $state(null);
    let chapter: LocalChapter | null = $state(null);
    let busy: string | null = $state(null);
    let error: string | null = $state(null);

    async function OpenFolder() {
        busy = 'Đang chờ chọn thư mục…';
        error = null;
        try {
            const picked = await PickLocalDirectory();
            if (!picked) {
                busy = null;
                return; // user cancelled
            }
            busy = `Đang đọc ${picked.files.length} ảnh…`;
            const local = new LocalChapter(`local:${picked.label}`, picked.label, picked.files);
            await local.Update();
            folder = picked;
            chapter = local;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            busy = null;
        }
    }

    function View() {
        if (!chapter) return;
        UI.selectedMedia = undefined;
        UI.selectedItem = chapter;
        UI.contentscreen = '/';
    }

    async function Translate() {
        if (!folder) return;
        const sidecar = await folder.readSidecar().catch(() => null);
        await TranslateWorkspace.OpenLocalFiles(folder.label, folder.files, sidecar, data => folder!.writeSidecar(data));
        UI.contentscreen = '/translate';
    }
</script>

<div class="local">
    <header>
        <h4>{L.Frontend_LocalFolder_Title()}</h4>
        {#if folder}
            <span class="path">{folder.label} — {folder.files.length}</span>
        {/if}
        <span class="spacer"></span>
        <Button size="small" icon={FolderIcon} disabled={!!busy} onclick={OpenFolder}>{L.Frontend_LocalFolder_Open()}</Button>
        {#if chapter}
            <Button size="small" kind="secondary" icon={ViewIcon} onclick={View}>{L.Frontend_LocalFolder_View()}</Button>
            <Button size="small" kind="secondary" icon={TranslateIcon} onclick={Translate}>{L.Frontend_LocalFolder_Translate()}</Button>
        {/if}
    </header>

    {#if busy}
        <InlineLoading description={busy} />
    {:else if error}
        <InlineNotification kind="error" title={error} hideCloseButton />
    {:else if !chapter}
        <p class="hint">{L.Frontend_LocalFolder_Empty()}</p>
    {:else}
        <div class="grid">
            {#each chapter.Entries.Value as page, i (i)}
                <button class="thumb" title={`Trang ${i + 1}`} onclick={View}>
                    <Image page={page} alt={`page_${i + 1}`} wide={false} />
                </button>
            {/each}
        </div>
    {/if}
</div>

<style>
    .local {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 0.5em;
        padding: 0.5em;
    }
    header {
        display: flex;
        align-items: center;
        gap: 0.5em;
    }
    header .path {
        color: var(--cds-text-helper);
        font-size: 0.85em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    header .spacer {
        flex: 1;
    }
    .hint {
        color: var(--cds-text-helper);
    }
    .grid {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5em;
        align-content: flex-start;
    }
    .thumb {
        all: unset;
        cursor: pointer;
        width: 12em;
    }
    .thumb :global(img) {
        width: 100%;
        height: 16em;
        object-fit: contain;
        background: var(--cds-ui-01);
        border-radius: 0.5em;
    }
</style>
