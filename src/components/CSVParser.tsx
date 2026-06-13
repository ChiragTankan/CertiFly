import React, { useState, useRef } from "react";
import * as xlsx from "xlsx";
import Papa from "papaparse";
import { Upload, FileSpreadsheet, Check, AlertCircle, Trash2, Search } from "lucide-react";
import { Recipient } from "../types";

interface CSVParserProps {
  onRawDataUploaded: (headers: string[], rawRows: any[], fileName: string) => void;
  onRecipientsParsed: (recipients: Omit<Recipient, "status">[]) => void;
  parsedCount: number;
}

export default function CSVParser({ onRawDataUploaded, onRecipientsParsed, parsedCount }: CSVParserProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File parsing core
  const processFile = (file: File) => {
    setError(null);
    setSuccess(false);
    setFileName(file.name);

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          mapDataToRecipients(results.data, file.name);
        },
        error: (err) => {
          setError(`Parsing error: ${err.message}`);
        }
      });
    } else if (extension === "xlsx" || extension === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = xlsx.read(data, { type: "array" });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const json = xlsx.utils.sheet_to_json(sheet);
          mapDataToRecipients(json, file.name);
        } catch (err: any) {
          setError(`Excel parsing failed: ${err.message}`);
        }
      };
      reader.onerror = () => {
        setError("Error reading the file.");
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError("Please upload a .csv, .xlsx, or .xls file.");
    }
  };

  // Maps excel/csv headers to required fields
  const mapDataToRecipients = (rawRows: any[], currentFileName: string) => {
    if (!rawRows || rawRows.length === 0) {
      setError("The uploaded file is empty.");
      return;
    }

    // Extract columns
    const firstRow = rawRows[0];
    const keys = Object.keys(firstRow);

    // Notify parent of headers and rows so the next step mapping interface activates
    onRawDataUploaded(keys, rawRows, currentFileName);

    // Run fuzzy automatic matching as fallback schema mapping
    const nameKey = keys.find(k => k.toLowerCase().includes("name") || k.toLowerCase().includes("fullname") || k.toLowerCase() === "names");
    const emailKey = keys.find(k => k.toLowerCase().includes("email") || k.toLowerCase().includes("mail") || k.toLowerCase().includes("address"));

    if (!nameKey || !emailKey) {
      // Don't error out hard, we let them map manually in the next card step
      setSuccess(true);
      return;
    }

    const validRecipients: Omit<Recipient, "status">[] = [];
    rawRows.forEach((row, index) => {
      const parsedName = String(row[nameKey] || "").trim();
      const parsedEmail = String(row[emailKey] || "").trim();

      if (parsedName && parsedEmail) {
        validRecipients.push({
          id: `rec_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`,
          name: parsedName,
          email: parsedEmail
        });
      }
    });

    setSuccess(true);
    onRecipientsParsed(validRecipients);
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div id="csv-parser-section" className="bg-zinc-950 border border-purple-900/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 id="participant-upload-title" className="text-base font-bold text-white font-sans tracking-tight flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
            Step 1: Upload Emails List
          </h2>
          <p className="text-[11px] text-white/80 font-sans mt-0.5">
            Select or drag and drop a CSV or Excel file of your participants.
          </p>
        </div>
        {parsedCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-900/40">
            <Check className="w-3.5 h-3.5" />
            File Uploaded
          </span>
        )}
      </div>

      {/* Drag & Drop Canvas */}
      <div
        id="drag-and-drop-container"
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        className={`relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl py-8 px-4 text-center cursor-pointer transition-all duration-300 ${
          dragActive
            ? "border-purple-500 bg-purple-950/40 scale-[1.01]"
            : "border-purple-950 bg-black/50 hover:bg-purple-950/20 hover:border-purple-800"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv, .xlsx, .xls"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="p-3 bg-zinc-900 border border-purple-900/40 rounded-xl shadow mb-3 text-purple-400 hover:scale-110 active:scale-95 transition-all duration-200">
          <Upload className="w-5 h-5 animate-pulse" />
        </div>

        <p className="text-sm font-bold text-white font-sans mb-1">
          {fileName ? `File: ${fileName}` : "Drag and drop your file here, or click to choose"}
        </p>
        <p className="text-[10px] text-white/60 font-mono tracking-wide">
          Supports CSV and Excel sheets (.csv, .xls, .xlsx)
        </p>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2.5 p-3.5 bg-rose-950/40 border border-rose-900/35 text-rose-300 rounded-xl text-xs font-sans">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && parsedCount > 0 && (
        <div className="mt-4 flex items-start gap-2.5 p-3 bg-emerald-950/40 border border-emerald-900/35 text-emerald-300 rounded-xl text-xs font-sans">
          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>File uploaded successfully! Continue to step 2 below.</span>
        </div>
      )}
    </div>
  );
}
