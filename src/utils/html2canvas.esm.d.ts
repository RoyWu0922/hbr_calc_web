interface Html2CanvasOptions {
  backgroundColor?: string;
  scale?: number;
  useCORS?: boolean;
  logging?: boolean;
  onclone?: (clonedDoc: Document) => void;
}

declare function html2canvas(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;

export default html2canvas;
