<script lang="ts">

    import { onDestroy } from 'svelte';
    import type { MediaItem } from '../../../../engine/providers/MediaPlugin';
    import { Priority } from '../../../../engine/taskpool/DeferredTask';
    import { ContextMenu, ContextMenuOption, InlineLoading, Button } from 'carbon-components-svelte';
    import Copy from 'carbon-icons-svelte/lib/Copy.svelte';
    import Save from 'carbon-icons-svelte/lib/Save.svelte';
    import TranslateIcon from 'carbon-icons-svelte/lib/Translate.svelte';
    import type { OCRBox } from '../../../../engine/platform/AI/IOCRProvider';
    interface Props {
        page: MediaItem;
        alt: string;
        wide: boolean;
        onLoad?: () => void;
    }

    let { page, alt, wide, onLoad }: Props = $props();
    let dataload: Promise<Blob> = $derived(page.Fetch(Priority.High, new AbortController().signal));
    let image: HTMLImageElement = $state();
    let ocrBoxes: OCRBox[] = $state([]);
    let translating = $state(false);
    let ocrError: string | null = $state(null);

    $effect(() => {
        dataload.then(() => onLoad?.());
    });

    onDestroy(() => {
        dataload.then((_src) => {
            URL.revokeObjectURL(image?.src);
        });
    });

    function downloadImage(data: Blob) {
        const extension = data.type.split('/')[1]?.split('+')[0] || 'image';
        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = `image.${extension}`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function copyImage(data: Blob) {
        const png = data.type === 'image/png' ? data : new Promise<Blob>((resolve, reject) => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            canvas.getContext('2d')?.drawImage(image, 0, 0);
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Unable to copy image'));
                }
            }, 'image/png');
        });
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    }

    async function TranslateImage(blob: Blob) {
        translating = true;
        ocrError = null;
        try {
            // @ts-ignore HakuNeko global
            const orch = window.HakuNeko?.TranslationOrchestrator ?? window.HakuNeko?.AITranslator;
            if (!orch) throw new Error('Translator not ready');
            if (!orch.IsOCREnabled()) throw new Error('Chọn OCR Provider trong Cài đặt trước');
            ocrBoxes = await orch.RecognizeAndTranslateImage(blob, 'vi');
            if (ocrBoxes.length === 0) ocrError = 'Không nhận diện được chữ';
        } catch (e) {
            ocrError = e instanceof Error ? e.message : String(e);
        } finally {
            translating = false;
        }
    }

</script>

{#await dataload}
    <InlineLoading class="imgpreview center " on:click />
{:then data}
    {#if data?.type.startsWith('image')}
        <div class="imgwrap">
            <img
                class="imgpreview"
                alt={page ? alt : ''}
                src={URL.createObjectURL(data)}
                class:wide={wide}
                draggable="false"
                bind:this={image}
            />
            {#each ocrBoxes as box}
                <div class="ocr-bubble" style="left:{box.x / 10}%; top:{box.y / 10}%; width:{box.width / 10}%; height:{box.height / 10}%;">{box.text}</div>
            {/each}
            <div class="ocr-actions">
                <Button size="small" icon={TranslateIcon} disabled={translating} on:click={() => TranslateImage(data)}>
                    {translating ? 'Đang dịch…' : 'Dịch ảnh'}
                </Button>
                {#if ocrError}<span class="ocr-error">{ocrError}</span>{/if}
            </div>
        </div>
        <ContextMenu target={[image]}>
            <ContextMenuOption icon={Save} labelText="Save image" onclick={() => downloadImage(data)} />
            <ContextMenuOption icon={Copy} labelText="Copy image" onclick={() => copyImage(data)} />
            <ContextMenuOption icon={TranslateIcon} labelText="Dịch ảnh (VI)" onclick={() => TranslateImage(data)} />
        </ContextMenu>
    {:else}
        <InlineLoading
            class="imgpreview center"
            status="error"
            description="Resource is not an image"
            on:click
        />
    {/if}
{:catch error}
    <InlineLoading
        class="imgpreview"
        status="error"
        description={error}
        on:click
    />
{/await}

<style>
    img {
        display: flex;
        transition: width 100ms ease-in-out;
        transition: height 100ms ease-in-out;
    }
    img.wide {
        transition: width 200ms ease-in-out;
        transition: height 200ms ease-in-out;
    }
    .imgwrap {
        position: relative;
        display: inline-block;
    }
    .ocr-bubble {
        position: absolute;
        background: rgba(255,255,255,0.92);
        border: 1px solid #ccc;
        border-radius: 6px;
        padding: 2px 4px;
        font-size: 12px;
        line-height: 1.2;
        color: #222;
        overflow: hidden;
        white-space: pre-wrap;
        word-break: break-word;
        box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    }
    .ocr-actions {
        position: absolute;
        bottom: 4px;
        right: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .ocr-error {
        font-size: 11px;
        color: #da1e28;
        background: rgba(255,255,255,0.9);
        padding: 2px 4px;
        border-radius: 4px;
    }

</style>
