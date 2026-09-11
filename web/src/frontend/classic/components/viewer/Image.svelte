<script lang="ts">

    import { onDestroy } from 'svelte';
    import type { MediaItem } from '../../../../engine/providers/MediaPlugin';
    import { Priority } from '../../../../engine/taskpool/DeferredTask';
    import { ContextMenu, ContextMenuOption, InlineLoading } from 'carbon-components-svelte';
    import Copy from 'carbon-icons-svelte/lib/Copy.svelte';
    import Save from 'carbon-icons-svelte/lib/Save.svelte';
    interface Props {
        page: MediaItem;
        alt: string;
        wide: boolean;
        onLoad?: () => void;
    }

    let { page, alt, wide, onLoad }: Props = $props();
    let abortCtrl: AbortController | undefined = $state(undefined);
    let image: HTMLImageElement = $state(undefined);
    let objectUrl: string | undefined = $state(undefined);

    function LoadPage(target: MediaItem) {
        abortCtrl?.abort();
        abortCtrl = new AbortController();
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = undefined;
        }
        return target.Fetch(Priority.High, abortCtrl.signal).then(blob => {
            const url = URL.createObjectURL(blob);
            objectUrl = url;
            return blob;
        });
    }

    let dataload: Promise<Blob> = $derived(LoadPage(page));

    $effect(() => {
        dataload.then(() => onLoad?.()).catch(() => {});
    });

    onDestroy(() => {
        abortCtrl?.abort();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
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

    async function copyImage(data: Blob) {
        try {
            if (!image) throw new Error('Image not loaded');
            await image.decode().catch(() => {});
            if (image.naturalWidth === 0) throw new Error('Image not ready');
            const png = data.type === 'image/png' ? data : await new Promise<Blob>((resolve, reject) => {
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                canvas.getContext('2d')?.drawImage(image, 0, 0);
                canvas.toBlob((blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Unable to copy image'));
                }, 'image/png');
            });
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
        } catch (e) {
            console.warn('Copy failed', e);
        }
    }

</script>

{#await dataload}
    <InlineLoading class="imgpreview center " on:click />
{:then data}
    {#if data?.type.startsWith('image')}
        <img
            class="imgpreview"
            alt={page ? alt : ''}
            src={objectUrl}
            class:wide={wide}
            draggable="false"
            bind:this={image}
        />
        {#if image}
            <ContextMenu target={[image]}>
                <ContextMenuOption icon={Save} labelText="Save image" onclick={() => downloadImage(data)} />
                <ContextMenuOption icon={Copy} labelText="Copy image" onclick={() => copyImage(data)} />
            </ContextMenu>
        {/if}
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

</style>
