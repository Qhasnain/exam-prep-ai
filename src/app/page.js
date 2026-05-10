"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
export default function Home() {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Handle multiple files
  const [files, setFiles] = useState([]);
  
  // Answer length selection
  const [answerLength, setAnswerLength] = useState("medium"); // small, medium, large

  const [printData, setPrintData] = useState({ query: "", answer: "" });
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const processAndAddFile = (file, customName) => {
    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      const url = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        const base64String = dataUrl.split(",")[1];
        
        setFiles(prev => [...prev, {
          name: customName || file.name,
          base64: base64String,
          mimeType: "image/jpeg",
          id: Date.now() + Math.random()
        }]);
      };
      img.src = url;
    } else if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          // Dynamically import pdfjs-dist to avoid SSR issues
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
          
          const arrayBuffer = reader.result;
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          const pdf = await loadingTask.promise;
          
          let extractedText = "";
          const maxPages = Math.min(pdf.numPages, 50); // limit to 50 pages to prevent massive payloads
          
          for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            extractedText += `--- Page ${i} ---\n${pageText}\n\n`;
          }
          
          setFiles(prev => [...prev, {
            name: customName || file.name,
            extractedText: extractedText,
            mimeType: file.type,
            id: Date.now() + Math.random()
          }]);
        } catch (error) {
          console.error("Error parsing PDF locally:", error);
          alert("Could not extract text from PDF. It might be corrupted or protected.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        setFiles(prev => [...prev, {
          name: customName || file.name,
          base64: base64String,
          mimeType: file.type,
          id: Date.now() + Math.random()
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const handlePaste = (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              processAndAddFile(file, "Pasted Image (" + file.type.split('/')[1] + ")");
            }
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() && files.length === 0) return;

    setLoading(true);
    setError("");
    
    // Check if user is asking for a PDF
    const wantsPdf = query.toLowerCase().includes("pdf format") || query.toLowerCase().includes("in pdf");

    try {
      const res = await fetch("/api/generate-answer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          prompt: query || "Please explain the attached document(s)/image(s).",
          filesData: files,
          answerLength: answerLength
        }),
      });

      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const textData = await res.text();
        if (res.status === 413 || textData.includes("Request Entity Too Large")) {
          throw new Error("The uploaded file(s) are too large. Please upload smaller files or try one at a time.");
        }
        throw new Error(`Server returned an error: ${textData.substring(0, 50)}...`);
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate answer");
      }

      const fileNames = files.map(f => f.name).join(", ");
      
      const newItem = {
        id: Date.now(),
        query: query || "Analysis Request",
        answer: data.answer,
        attachedFiles: fileNames
      };

      setHistory((prev) => [...prev, newItem]);
      setQuery("");
      setFiles([]);
      
      if (wantsPdf) {
        setTimeout(() => {
          downloadPDF(newItem.query, data.answer);
        }, 500);
      }
    } catch (err) {
      console.error("Error fetching answer:", err);
      setError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    selectedFiles.forEach(file => {
      processAndAddFile(file);
    });
    // Reset file input so the same file(s) can be selected again if needed
    e.target.value = null;
  };

  const removeFile = (idToRemove) => {
    setFiles(prev => prev.filter(f => f.id !== idToRemove));
  };

  const downloadPDF = (itemQuery, itemAnswer) => {
    setPrintData({ query: itemQuery, answer: itemAnswer });
    
    // Wait for state to update the hidden DOM before capturing
    setTimeout(async () => {
      const element = document.getElementById("print-container");
      if (!element) return;
      
      element.style.display = "block";
      
      try {
        const html2pdf = (await import("html2pdf.js")).default;
        const opt = {
          margin: 0.5,
          filename: 'Exam-Answer.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        await html2pdf().set(opt).from(element).save();
      } catch (err) {
        console.error("Failed to load PDF library:", err);
        alert("Could not generate PDF. Please try again.");
      } finally {
        element.style.display = "none";
      }
    }, 100);
  };

  return (
    <div className="container">
      <header className="header" style={{ position: 'relative' }}>
        <button 
          onClick={toggleTheme} 
          style={{ 
            position: 'absolute', 
            top: '0', 
            right: '0', 
            background: 'var(--bg-tertiary)', 
            border: '1px solid var(--border-color)', 
            color: 'var(--text-primary)', 
            padding: '0.5rem', 
            borderRadius: '50%', 
            cursor: 'pointer',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            transition: 'all 0.3s ease'
          }}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <h1>AI Exam Helper</h1>
        <p>Your ultimate university study companion. Ask any question and get a simplified, exam-ready answer perfect for assignments and tests.</p>
        <div className="designer-badge">
          <span className="badge-text">Specially Designed by <strong>Hasnain Qureshi</strong>, BS(CA) Semester 5, LJCCA</span>
        </div>
      </header>

      {/* CHAT HISTORY */}
      <div className="history-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '2rem' }}>
        {history.map((item) => (
          <div key={item.id} className="results-container" style={{ animation: 'fadeIn 0.5s ease' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
              <p style={{ margin: 0, fontWeight: 'bold', color: '#f8fafc' }}>{item.query}</p>
              {item.attachedFiles && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#93c5fd' }}>📎 Attached: {item.attachedFiles}</p>
              )}
            </div>
            
            <div className="results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #334155', paddingBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#93c5fd' }}>Generated Answer</h2>
              <button 
                onClick={() => downloadPDF(item.query, item.answer)}
                className="search-button" 
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', background: '#22c55e' }}
              >
                📥 Download Beautiful PDF
              </button>
            </div>
            <div style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.answer}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="loader">
          <div className="spinner"></div>
          <p className="loading-text">Analyzing request and generating an exam-friendly answer...</p>
        </div>
      )}

      {error && (
        <div className="results-container" style={{ borderLeft: '4px solid #ef4444', marginBottom: '2rem' }}>
          <h3 style={{ color: '#ef4444', marginTop: 0 }}>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {/* INPUT AREA */}
      <div className="search-container" style={{ position: 'sticky', bottom: '2rem', zIndex: 10 }}>
        
        {/* Selected Files Display */}
        {files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {files.map(file => (
              <div key={file.id} style={{ display: 'flex', alignItems: 'center', background: 'rgba(59, 130, 246, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '0.5rem', border: '1px solid #3b82f6', fontSize: '0.85rem', color: '#e0f2fe' }}>
                <span style={{ maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                <button 
                  onClick={() => removeFile(file.id)}
                  style={{ marginLeft: '0.5rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="search-form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input"
              placeholder="Ask a new question (e.g., Explain the OSI model...)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <button type="submit" className="search-button" disabled={loading || (!query.trim() && files.length === 0)}>
              {loading ? "Thinking..." : "Send Request"}
            </button>
          </div>
          
          <div className="controls-wrapper">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label className="upload-label" style={{ cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                <span>📄 Upload Notes or 🖼️ Images</span>
                <input type="file" multiple accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={handleFileChange} style={{ display: 'none' }} disabled={loading} />
              </label>
            </div>
            
            <div className="length-select-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.5rem 0.8rem', borderRadius: '0.75rem', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '500' }}>Answer Length:</span>
              <select 
                value={answerLength} 
                onChange={(e) => setAnswerLength(e.target.value)}
                disabled={loading}
                style={{ 
                  background: 'var(--bg-secondary)', 
                  color: 'var(--text-primary)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '0.5rem', 
                  padding: '0.4rem 0.8rem', 
                  fontSize: '0.9rem', 
                  outline: 'none',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                <option value="small" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '0.5rem' }}>Small (2 marks)</option>
                <option value="medium" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '0.5rem' }}>Medium (5 marks)</option>
                <option value="large" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', padding: '0.5rem' }}>Large (10 marks)</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      {/* Hidden container specifically styled for PDF export */}
      <div id="print-container" style={{ display: 'none', background: 'white', color: 'black', padding: '40px 50px', fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px', paddingBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
          <h1 style={{ color: '#1e3a8a', margin: '0 0 8px 0', fontSize: '34px', fontWeight: '800', letterSpacing: '-0.5px' }}>Software Engineering</h1>
          <h2 style={{ color: '#3b82f6', margin: '0 0 12px 0', fontSize: '18px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Exam-Ready Study Notes</h2>
          <p style={{ color: '#64748b', margin: 0, fontSize: '13px' }}>Based on: Pressman - Software Engineering: A Practitioner's Approach, 7th Ed.</p>
          <p style={{ color: '#94a3b8', margin: '5px 0 0 0', fontSize: '12px' }}>Specially Designed by <strong>Hasnain Qureshi</strong>, BS(CA) Semester 5, LJCCA</p>
        </div>
        
        <div style={{ textAlign: 'center', color: '#2563eb', fontWeight: 'bold', fontSize: '14px', marginBottom: '25px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span>★</span>
          <span>Each section is exam-ready for 5–10 mark questions</span>
          <span>★</span>
        </div>

        <div style={{ background: '#1e3a8a', color: 'white', padding: '15px 20px', fontWeight: 'bold', fontSize: '16px', marginBottom: '25px', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
          Q. {printData.query}
        </div>
        
        {/* The generated response content goes here */}
        <div className="pdf-markdown-body" style={{ lineHeight: '1.7', fontSize: '14px', color: '#334155' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{printData.answer}</ReactMarkdown>
        </div>
        
        <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
          <span>AI Exam Helper &copy; {new Date().getFullYear()}</span>
          <span>Generated for university exam preparation.</span>
        </div>
      </div>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} AI Exam Helper. Built for university students.</p>
      </footer>
    </div>
  );
}
