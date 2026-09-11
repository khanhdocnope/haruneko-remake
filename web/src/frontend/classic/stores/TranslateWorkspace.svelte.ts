import type { MediaContainer, MediaItem } from '../../../engine/providers/MediaPlugin';
import type { OCRBox } from '../../../engine/platform/AI/IOCRProvider';
import { Priority } from '../../../engine/taskpool/TaskPool';

export type EditableBox = OCRBox & {
    originalAI: string;
    isEdited: boolean;
};

export type TranslatePageStatus = 'idle' | 'loading' | 'translating' | 'done' | 'error';

export type TranslatePage = {
    id: string;
    name: string;
    fetch: () => Promise<Blob>;
    blob?: Blob;
    boxes: EditableBox[];
    status: TranslatePageStatus;
    error?: string;
    fromSidecar: boolean;
};

export type LocalTranslateFile = {
    name: string;
    read(): Promise<Blob>;
};

function ToEditable(boxes: OCRBox[]): EditableBox[] {
    return boxes.map(box => ({ ...box, originalAI: box.text, isEdited: false }));
}

function ToPlain(boxes: EditableBox[]): OCRBox[] {
    return boxes.map(({ originalAI: _originalAI, isEdited: _isEdited, ...rest }) => rest);
}

class TranslateWorkspaceStore {

    sourceTitle = $state('');
    sourceKind: 'chapter' | 'local' | null = $state(null);
    pages: TranslatePage[] = $state([]);
    currentIndex = $state(0);
    translatingAll = $state(false);
    tryFree = $state(false);
    private stopRequested = false;
    private writeSidecar: ((data: Record<string, OCRBox[]>) => Promise<void>) | null = null;

    readonly HasContent = $derived(this.pages.length > 0);
    readonly DoneCount = $derived(this.pages.filter(page => page.status === 'done').length);

    private Reset(sourceTitle: string, kind: 'chapter' | 'local') {
        this.sourceTitle = sourceTitle;
        this.sourceKind = kind;
        this.pages = [];
        this.currentIndex = 0;
        this.translatingAll = false;
        this.tryFree = false;
        this.stopRequested = false;
        this.writeSidecar = null;
    }

    public async OpenChapter(item: MediaContainer<MediaItem>): Promise<void> {
        this.Reset(item.Title, 'chapter');
        if (item.Entries.Value.length === 0) {
            await item.Update();
        }
        this.pages = item.Entries.Value.map((entry, index) => ({
            id: `${item.Identifier}#${index}`,
            name: `Trang ${index + 1}`,
            fetch: () => entry.Fetch(Priority.High, new AbortController().signal),
            boxes: [],
            status: 'idle' as TranslatePageStatus,
            fromSidecar: false,
        }));
    }

    public async OpenLocalFiles(label: string, files: LocalTranslateFile[], sidecar: Record<string, OCRBox[]> | null, writeSidecar?: (data: Record<string, OCRBox[]>) => Promise<void>): Promise<void> {
        this.Reset(label, 'local');
        this.writeSidecar = writeSidecar ?? null;
        this.pages = files.map(file => {
            const saved = sidecar?.[file.name];
            return {
                id: `local:${label}/${file.name}`,
                name: file.name,
                fetch: () => file.read(),
                boxes: saved ? ToEditable(saved) : [],
                status: (saved ? 'done' : 'idle') as TranslatePageStatus,
                fromSidecar: !!saved,
            };
        });
    }

    public async TranslatePage(index: number): Promise<void> {
        const page = this.pages[index];
        if (!page || page.status === 'translating' || page.status === 'loading') return;
        const orch = window.HakuNeko?.TranslationOrchestrator;
        if (!orch) {
            page.status = 'error';
            page.error = 'Translator not ready';
            return;
        }
        page.status = 'loading';
        page.error = undefined;
        try {
            page.blob ??= await page.fetch();
            if (!orch.IsOCREnabled()) {
                page.status = 'error';
                page.error = 'need-setup';
                return;
            }
            page.status = 'translating';
            const boxes = await orch.RecognizeAndTranslateImage(page.blob, 'vi');
            if (this.stopRequested) {
                page.status = 'idle';
                return;
            }
            if (boxes.length === 0) {
                page.status = 'error';
                page.error = 'empty';
                return;
            }
            page.boxes = ToEditable(boxes);
            page.fromSidecar = false;
            page.status = 'done';
            await this.PersistPage(index);
        } catch (error) {
            page.status = 'error';
            page.error = error instanceof Error ? error.message : String(error);
        }
    }

    public async TranslateAll(): Promise<void> {
        if (this.translatingAll) return;
        this.translatingAll = true;
        this.stopRequested = false;
        try {
            for (let i = 0; i < this.pages.length; i++) {
                if (this.stopRequested) break;
                if (this.pages[i].status === 'done') continue;
                this.currentIndex = i;
                await this.TranslatePage(i);
            }
        } finally {
            this.translatingAll = false;
            this.stopRequested = false;
        }
    }

    public Stop(): void {
        this.stopRequested = true;
    }

    public async SaveEdit(pageIndex: number, boxIndex: number, text: string): Promise<void> {
        const page = this.pages[pageIndex];
        const box = page?.boxes[boxIndex];
        if (!box) return;
        page.boxes = page.boxes.map((entry, i) => i === boxIndex
            ? { ...entry, text, isEdited: text !== entry.originalAI }
            : entry);
        await this.PersistPage(pageIndex);
    }

    public async ResetBox(pageIndex: number, boxIndex: number): Promise<void> {
        const page = this.pages[pageIndex];
        const box = page?.boxes[boxIndex];
        if (!box) return;
        page.boxes = page.boxes.map((entry, i) => i === boxIndex
            ? { ...entry, text: entry.originalAI, isEdited: false }
            : entry);
        await this.PersistPage(pageIndex);
    }

    private async PersistPage(pageIndex: number): Promise<void> {
        const page = this.pages[pageIndex];
        if (!page || !page.blob || page.boxes.length === 0) return;
        const orch = window.HakuNeko?.TranslationOrchestrator;
        // Always refresh the local IDB cache so reopening is instant.
        await orch?.SaveImageBoxes(page.blob, ToPlain(page.boxes)).catch(() => {});
        // Local folders additionally keep a sidecar next to the files.
        if (this.sourceKind === 'local' && this.writeSidecar) {
            const data: Record<string, OCRBox[]> = {};
            for (const p of this.pages) {
                if (p.boxes.length > 0) data[p.name] = ToPlain(p.boxes);
            }
            await this.writeSidecar(data).catch(() => {});
        }
    }
}

export const TranslateWorkspace = new TranslateWorkspaceStore();
