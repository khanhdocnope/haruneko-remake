<script lang="ts">
    import type { EditableBox } from '../../stores/TranslateWorkspace.svelte';

    interface Props {
        box: EditableBox;
        onSave: (text: string) => void;
        onReset: () => void;
    }

    let { box, onSave, onReset }: Props = $props();
    let editing = $state(false);
    let draft = $state('');

    function StartEdit() {
        draft = box.text;
        editing = true;
    }

    function Commit() {
        editing = false;
        if (draft !== box.text) onSave(draft);
    }

    function Cancel() {
        editing = false;
    }

    function OnKey(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            Commit();
        } else if (event.key === 'Escape') {
            Cancel();
        }
    }
</script>

{#if editing}
    <textarea
        class="ocr-bubble ocr-edit"
        style="left:{box.x / 10}%; top:{box.y / 10}%; width:{box.width / 10}%; min-height:{box.height / 10}%;"
        bind:value={draft}
        onkeydown={OnKey}
        onblur={Commit}
        onclick={(event) => event.stopPropagation()}
    ></textarea>
{:else}
    <div
        class="ocr-bubble"
        class:edited={box.isEdited}
        style="left:{box.x / 10}%; top:{box.y / 10}%; width:{box.width / 10}%; height:{box.height / 10}%;"
        title="Bấm để sửa"
        role="button"
        tabindex="0"
        onclick={StartEdit}
        onkeydown={(event) => { if (event.key === 'Enter') StartEdit(); }}
    >
        {box.text}{#if box.isEdited}<span class="edited-mark" title="Đã sửa"> ✎</span>{/if}
        {#if box.isEdited}
            <button
                class="reset-btn"
                title="Về bản AI"
                onclick={(event) => { event.stopPropagation(); onReset(); }}
            >↺</button>
        {/if}
    </div>
{/if}

<style>
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
        cursor: text;
    }
    .ocr-bubble.edited {
        border-color: #0f62fe;
    }
    .edited-mark {
        color: #0f62fe;
        font-weight: bold;
    }
    .reset-btn {
        all: unset;
        cursor: pointer;
        margin-left: 4px;
        color: #0f62fe;
        font-weight: bold;
    }
    .ocr-edit {
        resize: both;
        font: inherit;
        z-index: 5;
    }
</style>
