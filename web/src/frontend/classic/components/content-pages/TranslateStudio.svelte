<script lang="ts">
    import {
        Button,
        InlineLoading,
        InlineNotification,
        Modal,
        Select,
        SelectItem,
        TextInput,
    } from 'carbon-components-svelte';
    import TranslateIcon from 'carbon-icons-svelte/lib/Translate.svelte';
    import FolderIcon from 'carbon-icons-svelte/lib/Folder.svelte';
    import StopIcon from 'carbon-icons-svelte/lib/Stop.svelte';
    import ResetIcon from 'carbon-icons-svelte/lib/Reset.svelte';
    import ViewIcon from 'carbon-icons-svelte/lib/View.svelte';
    import { TranslateWorkspace } from '../../stores/TranslateWorkspace.svelte';
    import { Store as UI } from '../../stores/Stores.svelte';
    import { GlobalSettings } from '../../stores/Settings.svelte';
    import { Key as GlobalKey, Scope as GlobalScope } from '../../../../engine/SettingsGlobal';
    import { Choice, Secret, Text } from '../../../../engine/SettingsManager';
    import EditableBubble from '../viewer/EditableBubble.svelte';

    const L = GlobalSettings.Locale;
    const orch = window.HakuNeko?.TranslationOrchestrator;

    // Re-evaluated whenever the wizard changes settings.
    let setupTick = $state(0);
    let ocrReady = $derived(setupTick >= 0 && (orch?.IsOCREnabled() ?? false));

    // ---- center image ----
    let centerUrl: string | undefined = $state(undefined);
    let centerLoading = $state(false);
    let centerError: string | null = $state(null);
    let imageEl: HTMLImageElement = $state(undefined);
    let loadToken = 0;
    let selectedBox = $state(-1);
    let hideBoxes = $state(false);

    const currentPage = $derived(TranslateWorkspace.pages[TranslateWorkspace.currentIndex]);

    $effect(() => {
        const page = currentPage;
        selectedBox = -1;
        if (centerUrl) {
            URL.revokeObjectURL(centerUrl);
            centerUrl = undefined;
        }
        if (!page) return;
        const token = ++loadToken;
        if (page.blob) {
            centerUrl = URL.createObjectURL(page.blob);
            return;
        }
        centerLoading = true;
        centerError = null;
        page.fetch()
            .then(blob => {
                if (token !== loadToken) return;
                page.blob = blob;
                centerUrl = URL.createObjectURL(blob);
            })
            .catch(error => {
                if (token !== loadToken) return;
                centerError = error instanceof Error ? error.message : String(error);
            })
            .finally(() => {
                if (token === loadToken) centerLoading = false;
            });
    });

    async function NormalizedBoxes() {
        const page = currentPage;
        if (!page || page.boxes.length === 0) return [];
        const relative = page.boxes.every(box => box.x <= 1000 && box.y <= 1000 && box.width <= 1000 && box.height <= 1000);
        if (relative || !imageEl) return page.boxes;
        await imageEl.decode().catch(() => {});
        const w = imageEl.naturalWidth || 1000;
        const h = imageEl.naturalHeight || 1000;
        return page.boxes.map(box => ({
            ...box,
            x: box.x / w * 1000,
            y: box.y / h * 1000,
            width: box.width / w * 1000,
            height: box.height / h * 1000,
        }));
    }
    let viewBoxes = $state([]);
    $effect(() => {
        const boxes = currentPage?.boxes;
        // Track image element so coordinates rescale once it loads.
        const img = imageEl;
        if (!currentPage || !boxes) {
            viewBoxes = [];
            return;
        }
        void img;
        NormalizedBoxes().then(result => { viewBoxes = result; });
    });

    function PageErrorText(error: string | undefined): string {
        if (error === 'need-setup') return L.Frontend_Translate_Setup_Title();
        if (error === 'empty') return 'Không nhận diện được chữ';
        return error ?? '';
    }

    // ---- wizard ----
    let wizProvider = $state('gemini-vision');
    let wizKey = $state('');
    let wizTesting = $state(false);
    let wizStatus: 'idle' | 'ok' | 'fail' = $state('idle');

    function ApplyWizardSettings() {
        const settings = window.HakuNeko.SettingsManager.OpenScope(GlobalScope);
        if (wizProvider === 'gemini-vision') {
            settings.Get<Choice>(GlobalKey.AIProvider).Value = 'gemini';
            settings.Get<Choice>(GlobalKey.OCRProvider).Value = 'gemini-vision';
            settings.Get<Text>(GlobalKey.AIModel).Value = 'gemini-1.5-flash';
        } else {
            settings.Get<Choice>(GlobalKey.AIProvider).Value = 'openai';
            settings.Get<Choice>(GlobalKey.OCRProvider).Value = 'openai-vision';
            settings.Get<Text>(GlobalKey.AIModel).Value = 'gpt-4o-mini';
        }
        settings.Get<Secret>(GlobalKey.AIKey).Value = wizKey;
        setupTick++;
    }

    async function TestWizard() {
        wizTesting = true;
        wizStatus = 'idle';
        try {
            ApplyWizardSettings();
            wizStatus = (await orch?.TestOCR()) ? 'ok' : 'fail';
        } catch {
            wizStatus = 'fail';
        } finally {
            wizTesting = false;
        }
    }

    function UseTryFree() {
        const settings = window.HakuNeko.SettingsManager.OpenScope(GlobalScope);
        settings.Get<Choice>(GlobalKey.AIProvider).Value = 'google';
        setupTick++;
        TranslateWorkspace.tryFree = true;
    }

    // ---- translate-all confirm ----
    let confirmAll = $state(false);

    function OpenCurrentChapter() {
        const item = UI.selectedItem;
        if (item) TranslateWorkspace.OpenChapter(item);
    }
</script>

<div class="studio">
    <header>
        <h4>{L.Frontend_Translate_Title()}</h4>
        {#if TranslateWorkspace.HasContent}
            <span class="source">{TranslateWorkspace.sourceTitle} — {TranslateWorkspace.DoneCount}/{TranslateWorkspace.pages.length}</span>
        {/if}
    </header>

    {#if !TranslateWorkspace.HasContent}
        <div class="empty">
            <p>{L.Frontend_Translate_Empty()}</p>
            <div class="row">
                {#if UI.selectedItem}
                    <Button icon={TranslateIcon} onclick={OpenCurrentChapter}>Dịch chương đang xem</Button>
                {/if}
                <Button kind="secondary" icon={FolderIcon} onclick={() => { UI.contentscreen = '/local'; }}>{L.Frontend_LocalFolder_Open()}</Button>
            </div>
        </div>
    {:else if !ocrReady && !TranslateWorkspace.tryFree}
        <div class="wizard">
            <h5>{L.Frontend_Translate_Setup_Title()}</h5>
            <Select labelText={L.Frontend_Translate_Setup_Provider()} bind:selected={wizProvider}>
                <SelectItem value="gemini-vision" text="Google Gemini Vision (khuyên dùng)" />
                <SelectItem value="openai-vision" text="OpenAI Vision" />
            </Select>
            <TextInput
                labelText={L.Frontend_Translate_Setup_Key()}
                type="password"
                placeholder="Dán key vào đây…"
                bind:value={wizKey}
            />
            {#if !wizKey}
                <InlineNotification kind="info" title={L.Frontend_Translate_Setup_NeedKey()} hideCloseButton />
            {/if}
            <div class="row">
                <Button icon={TranslateIcon} disabled={!wizKey || wizTesting} onclick={TestWizard}>
                    {wizTesting ? L.Frontend_Translate_Translating() : L.Frontend_Translate_Setup_Test()}
                </Button>
                {#if wizStatus === 'ok'}
                    <Button kind="primary" onclick={() => { setupTick++; }}>{L.Frontend_Translate_Setup_Done()}</Button>
                {/if}
                <Button kind="ghost" onclick={UseTryFree}>{L.Frontend_Translate_Setup_TryFree()}</Button>
            </div>
            {#if wizStatus === 'ok'}
                <InlineNotification kind="success" title={L.Frontend_Translate_Setup_TestOK()} hideCloseButton />
            {:else if wizStatus === 'fail'}
                <InlineNotification kind="error" title={L.Frontend_Translate_Setup_TestFail()} hideCloseButton />
            {/if}
        </div>
    {:else}
        {#if TranslateWorkspace.tryFree && !ocrReady}
            <InlineNotification
                kind="info"
                title="Chế độ dùng thử: chỉ xem bản dịch đã lưu. Nhập key để dịch mới."
                subtitle="Mở lại cài đặt để nhập key."
                hideCloseButton
            />
        {/if}
        <div class="toolbar row">
            <Button
                size="small"
                icon={TranslateIcon}
                disabled={currentPage?.status === 'translating' || TranslateWorkspace.translatingAll}
                onclick={() => TranslateWorkspace.TranslatePage(TranslateWorkspace.currentIndex)}
            >
                {currentPage?.status === 'translating' ? L.Frontend_Translate_Translating() : L.Frontend_Translate_TranslatePage()}
            </Button>
            <Button size="small" kind="secondary" disabled={TranslateWorkspace.translatingAll} onclick={() => { confirmAll = true; }}>
                {L.Frontend_Translate_TranslateAll()}
            </Button>
            {#if TranslateWorkspace.translatingAll}
                <Button size="small" kind="danger" icon={StopIcon} onclick={() => TranslateWorkspace.Stop()}>{L.Frontend_Translate_Stop()}</Button>
            {/if}
            <Button
                size="small"
                kind="ghost"
                icon={ViewIcon}
                title={L.Frontend_Translate_ShowOriginal()}
                onpointerdown={() => { hideBoxes = true; }}
                onpointerup={() => { hideBoxes = false; }}
                onpointerleave={() => { hideBoxes = false; }}
            >
                {L.Frontend_Translate_ShowOriginal()}
            </Button>
        </div>

        <div class="workspace">
            <aside class="pages">
                {#each TranslateWorkspace.pages as page, i (page.id)}
                    <button
                        class="page-thumb"
                        class:selected={i === TranslateWorkspace.currentIndex}
                        class:done={page.status === 'done'}
                        onclick={() => { TranslateWorkspace.currentIndex = i; }}
                        title={page.name}
                    >
                        <span class="num">{i + 1}</span>
                        <span class="dot dot-{page.status}"></span>
                    </button>
                {/each}
            </aside>

            <main class="canvas">
                {#if centerLoading}
                    <InlineLoading description={L.Frontend_Translate_Translating()} />
                {:else if centerError}
                    <InlineNotification kind="error" title={centerError} hideCloseButton />
                {:else if centerUrl}
                    <div class="imgwrap">
                        <img src={centerUrl} alt={currentPage?.name ?? ''} draggable="false" bind:this={imageEl} />
                        {#if !hideBoxes}
                            {#each viewBoxes as box, bi (bi)}
                                <EditableBubble
                                    {box}
                                    onSave={(text) => TranslateWorkspace.SaveEdit(TranslateWorkspace.currentIndex, bi, text)}
                                    onReset={() => TranslateWorkspace.ResetBox(TranslateWorkspace.currentIndex, bi)}
                                />
                            {/each}
                        {/if}
                    </div>
                {/if}
                {#if currentPage?.status === 'error' && currentPage.error}
                    <InlineNotification kind="error" title={PageErrorText(currentPage.error)} hideCloseButton />
                {/if}
            </main>

            <aside class="sentences">
                <h6>{L.Frontend_Translate_Translated()} ({currentPage?.boxes.length ?? 0})</h6>
                {#if currentPage}
                    {#each currentPage.boxes as box, bi (bi)}
                        <button
                            class="sentence"
                            class:selected={bi === selectedBox}
                            onclick={() => { selectedBox = bi; }}
                        >
                            <div class="orig">{L.Frontend_Translate_Original()}: {box.originalAI}</div>
                            <div class="trans">{box.text}{#if box.isEdited} <span class="edited">({L.Frontend_Translate_Edited()})</span>{/if}</div>
                        </button>
                    {/each}
                    {#if currentPage.boxes.length === 0}
                        <p class="hint">Bấm “{L.Frontend_Translate_TranslatePage()}” để dịch trang này.</p>
                    {/if}
                {/if}
            </aside>
        </div>
    {/if}
</div>

<Modal
    bind:open={confirmAll}
    modalHeading={L.Frontend_Translate_ConfirmAll_Title()}
    primaryButtonText={L.Frontend_Translate_TranslateAll()}
    secondaryButtonText={L.Frontend_Translate_Stop()}
    on:click:button--secondary={() => { confirmAll = false; }}
    on:submit={() => { confirmAll = false; TranslateWorkspace.TranslateAll(); }}
>
    <p>{L.Frontend_Translate_ConfirmAll_Body()}</p>
</Modal>

<style>
    .studio {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 0.5em;
        padding: 0.5em;
    }
    header {
        display: flex;
        align-items: baseline;
        gap: 1em;
    }
    header .source {
        color: var(--cds-text-helper);
        font-size: 0.85em;
    }
    .row {
        display: flex;
        gap: 0.5em;
        flex-wrap: wrap;
        align-items: center;
    }
    .empty, .wizard {
        max-width: 40em;
        display: flex;
        flex-direction: column;
        gap: 1em;
    }
    .toolbar {
        padding: 0.25em 0;
    }
    .workspace {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 4em 1fr 22em;
        gap: 0.5em;
    }
    .pages {
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.25em;
    }
    .page-thumb {
        all: unset;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.4em;
        padding: 0.4em;
        border-radius: 0.4em;
        border: 1px solid var(--cds-ui-03);
    }
    .page-thumb.selected {
        border-color: var(--cds-interactive-01);
        background: var(--cds-hover-ui);
    }
    .page-thumb .num {
        font-weight: bold;
    }
    .dot {
        width: 0.6em;
        height: 0.6em;
        border-radius: 50%;
        background: var(--cds-ui-04);
    }
    .dot-done { background: var(--cds-support-success); }
    .dot-translating, .dot-loading { background: var(--cds-support-warning); }
    .dot-error { background: var(--cds-support-error); }
    .canvas {
        overflow: auto;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        background: var(--cds-ui-01);
        border-radius: 0.5em;
        padding: 0.5em;
    }
    .imgwrap {
        position: relative;
        display: inline-block;
        max-width: 100%;
    }
    .imgwrap img {
        max-width: 100%;
        display: block;
    }
    .sentences {
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.5em;
    }
    .sentence {
        all: unset;
        cursor: pointer;
        display: block;
        border: 1px solid var(--cds-ui-03);
        border-radius: 0.4em;
        padding: 0.4em;
    }
    .sentence.selected {
        border-color: var(--cds-interactive-01);
    }
    .sentence .orig {
        font-size: 0.8em;
        color: var(--cds-text-helper);
        white-space: pre-wrap;
    }
    .sentence .trans {
        white-space: pre-wrap;
    }
    .sentence .edited {
        color: var(--cds-interactive-01);
        font-size: 0.8em;
    }
    .hint {
        color: var(--cds-text-helper);
        font-size: 0.85em;
    }
</style>
