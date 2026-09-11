import { MediaContainer, MediaItem } from './MediaPlugin';
import type { Priority } from '../taskpool/TaskPool';

/**
 * A single image file coming from a local folder (disk or File System Access).
 * Wraps a lazy {@link read} so the existing Viewer and OCR pipeline can
 * consume local files exactly like downloaded pages.
 */
export type LocalFileRef = {
    name: string;
    read(): Promise<Blob>;
};

export class LocalImageItem extends MediaItem {

    public constructor(parent: MediaContainer<MediaItem>, public readonly file: LocalFileRef) {
        super(parent);
    }

    public override async Fetch(_priority: Priority, _signal: AbortSignal): Promise<Blob> {
        return this.file.read();
    }
}

/**
 * A chapter-like container backed by local image files.
 * Entries are known upfront, so `Update()` simply materializes them and
 * the regular {@link Viewer} can render them without any change.
 */
export class LocalChapter extends MediaContainer<MediaItem> {

    public constructor(identifier: string, title: string, private readonly files: LocalFileRef[]) {
        super(identifier, title);
    }

    protected override async PerformUpdate(): Promise<MediaItem[]> {
        return this.files.map(file => new LocalImageItem(this, file));
    }
}
