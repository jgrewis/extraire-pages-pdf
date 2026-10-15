"""Extraire des pages d'un PDF.

Utilisation : glisser-déposer un fichier PDF sur ce script.
(Double-cliquer dessus ouvre un sélecteur de fichier.)

Syntaxe des pages : 1-3, 5, 8-   (8- = de la page 8 à la fin)
"""

import os
import re
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--user", "pypdf"])
    from pypdf import PdfReader, PdfWriter


def parse_pages(text, total):
    """Transforme '1-3, 5, 8-' en liste d'index (base 0), dans l'ordre saisi."""
    pages = []
    for part in re.split(r"[,;\s]+", text.strip()):
        if not part:
            continue
        if re.fullmatch(r"\d+(-\d+){2,}", part):
            # 13-14-15-16 : une liste de pages séparées par des tirets
            for n in map(int, part.split("-")):
                if not 1 <= n <= total:
                    raise ValueError(f"La page {n} sort du document (1 à {total}).")
                pages.append(n - 1)
            continue
        m = re.fullmatch(r"(\d*)-(\d*)", part)
        if m:
            start = int(m.group(1)) if m.group(1) else 1
            end = int(m.group(2)) if m.group(2) else total
        elif part.isdigit():
            start = end = int(part)
        else:
            raise ValueError(f"Saisie invalide : « {part} »")
        if not (1 <= start <= total and 1 <= end <= total):
            raise ValueError(f"« {part} » sort du document (1 à {total}).")
        step = 1 if end >= start else -1
        pages.extend(range(start - 1, end - 1 + step, step))
    if not pages:
        raise ValueError("Aucune page indiquée.")
    return pages


def unique_path(path):
    base, ext = os.path.splitext(path)
    i = 2
    while os.path.exists(path):
        path = f"{base} ({i}){ext}"
        i += 1
    return path


def label_for(text):
    return re.sub(r"[^\d\-]+", "_", text.strip()).strip("_")


class App:
    def __init__(self, root, pdf_path):
        self.root = root
        self.pdf_path = pdf_path
        self.reader = PdfReader(pdf_path)
        if self.reader.is_encrypted:
            self.reader.decrypt("")
        self.total = len(self.reader.pages)

        root.title("Extraire des pages PDF")
        root.resizable(False, False)
        frm = ttk.Frame(root, padding=16)
        frm.grid()

        ttk.Label(frm, text=os.path.basename(pdf_path), font=("Segoe UI", 10, "bold")).grid(
            row=0, column=0, columnspan=2, sticky="w")
        ttk.Label(frm, text=f"{self.total} page(s)").grid(row=1, column=0, columnspan=2, sticky="w")

        ttk.Label(frm, text="Pages à exporter :").grid(row=2, column=0, sticky="w", pady=(12, 0))
        self.entry = ttk.Entry(frm, width=30)
        self.entry.grid(row=3, column=0, columnspan=2, sticky="we")
        self.entry.focus()
        ttk.Label(frm, text="Ex. : 1-3, 5, 8-   (8- = jusqu'à la fin)\nou : 13-14-15-16", foreground="gray").grid(
            row=4, column=0, columnspan=2, sticky="w")

        self.separate = tk.BooleanVar(value=False)
        ttk.Radiobutton(frm, text="Un seul PDF", variable=self.separate, value=False).grid(
            row=5, column=0, sticky="w", pady=(12, 0))
        ttk.Radiobutton(frm, text="Un PDF par page", variable=self.separate, value=True).grid(
            row=6, column=0, sticky="w")

        btns = ttk.Frame(frm)
        btns.grid(row=7, column=0, columnspan=2, sticky="e", pady=(16, 0))
        ttk.Button(btns, text="Annuler", command=root.destroy).pack(side="right")
        ttk.Button(btns, text="Exporter", command=self.export).pack(side="right", padx=(0, 8))

        root.bind("<Return>", lambda e: self.export())
        root.bind("<Escape>", lambda e: root.destroy())

    def export(self):
        try:
            pages = parse_pages(self.entry.get(), self.total)
        except ValueError as e:
            messagebox.showerror("Pages invalides", str(e), parent=self.root)
            return

        folder = os.path.dirname(self.pdf_path)
        stem = os.path.splitext(os.path.basename(self.pdf_path))[0]
        written = []

        if self.separate.get():
            folder = filedialog.askdirectory(
                title="Dossier où enregistrer les pages", initialdir=folder, parent=self.root)
            if not folder:
                return
            for i in pages:
                w = PdfWriter()
                w.add_page(self.reader.pages[i])
                written.append(self._save(w, os.path.join(folder, f"{stem}_page_{i + 1}.pdf")))
        else:
            path = filedialog.asksaveasfilename(
                title="Enregistrer les pages sous", initialdir=folder,
                initialfile=f"{stem}_pages_{label_for(self.entry.get())}.pdf",
                defaultextension=".pdf", filetypes=[("PDF", "*.pdf")], parent=self.root)
            if not path:
                return
            folder = os.path.dirname(path)
            w = PdfWriter()
            for i in pages:
                w.add_page(self.reader.pages[i])
            # La boîte « Enregistrer sous » demande déjà confirmation avant d'écraser
            written.append(self._save(w, path, overwrite=True))

        msg = "\n".join(os.path.basename(p) for p in written[:10])
        if len(written) > 10:
            msg += f"\n… et {len(written) - 10} autre(s)"
        messagebox.showinfo("Export terminé", f"Enregistré dans {folder} :\n\n{msg}", parent=self.root)
        self.root.destroy()

    @staticmethod
    def _save(writer, path, overwrite=False):
        if not overwrite:
            path = unique_path(path)
        with open(path, "wb") as f:
            writer.write(f)
        return path


def main():
    root = tk.Tk()
    root.withdraw()

    if len(sys.argv) > 1:
        pdf_path = sys.argv[1]
    else:
        pdf_path = filedialog.askopenfilename(title="Choisir un PDF", filetypes=[("PDF", "*.pdf")])
        if not pdf_path:
            return

    try:
        app = App(root, pdf_path)
    except Exception as e:
        messagebox.showerror("Erreur", f"Impossible d'ouvrir le PDF :\n{e}")
        return

    root.deiconify()
    root.mainloop()


if __name__ == "__main__":
    main()
