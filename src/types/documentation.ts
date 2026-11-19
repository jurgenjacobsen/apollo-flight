export interface DocFileRecord {
    path: string;
    name: string;
    extension: "md" | "pdf";
    sizeBytes: number;
    size_bytes?: number;
    modified?: string;
    source: "docs" | "user-docs" | "custom";
    sourceDir?: string;
    source_dir?: string;
    title?: string;
    lastSeen?: string;
    last_seen?: string;
    tags: string[];
}

export interface DocFileContent {
    path: string;
    extension: "md" | "pdf";
    textContent?: string;
    text_content?: string;
    base64Content?: string;
    base64_content?: string;
}
