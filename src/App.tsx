import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AudioFile {
  name: string;
  path: string;
  duration: number; // Duration in seconds
}

function App() {
  const [path, setPath] = useState("");
  const [files, setFiles] = useState<AudioFile[]>([]);

  // Helper to format seconds into MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleScan = async () => {
    try {
      // Invoke the Rust command
      const result: AudioFile[] = await invoke("scan_directory", { basePath: path });
      setFiles(result);
    } catch (error) {
      console.error("Scan error:", error);
    }
  };

  return (
    <main className="p-10 bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold mb-6">Aivys Player</h1>

      <div className="flex gap-2 mb-8">
        <input
          type="text"
          placeholder="Enter path (e.g., D:/Music)"
          className="bg-gray-800 border border-gray-700 p-2 flex-1 rounded text-white focus:outline-none focus:border-blue-500"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <button
          onClick={handleScan}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded font-medium transition-colors"
        >
          Scan Directory
        </button>
      </div>

      <div className="grid gap-3">
        {files.map((file, i) => (
          <div key={i} className="flex justify-between items-center p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-gray-500 transition-all">
            <div className="overflow-hidden">
              <p className="font-semibold truncate">{file.name}</p>
            </div>
            <span className="text-sm font-mono bg-gray-700 px-2 py-1 rounded">
              {formatDuration(file.duration)}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}

export default App;