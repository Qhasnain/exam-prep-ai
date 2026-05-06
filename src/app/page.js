"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

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

  useEffect(() => {
    const handlePaste = (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                setFiles(prev => [...prev, {
                  name: "Pasted Image (" + file.type.split('/')[1] + ")",
                  base64: base64String,
                  mimeType: file.type,
                  id: Date.now() + Math.random() // unique id for key
                }]);
              };
              reader.readAsDataURL(file);
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

      const data = await res.json();

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
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        setFiles(prev => [...prev, {
          name: file.name,
          base64: base64String,
          mimeType: file.type,
          id: Date.now() + Math.random()
        }]);
      };
      reader.readAsDataURL(file);
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
          <span className="badge-text">Specially Designed by <strong>Hasnain Qureshi</strong>, LJCCA Student</span>
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
              <ReactMarkdown>{item.answer}</ReactMarkdown>
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
      <div id="print-container" style={{ display: 'none', background: 'white', color: 'black', padding: '40px', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #3b82f6', paddingBottom: '20px', marginBottom: '30px' }}>
          <h1 style={{ color: '#1e3a8a', margin: '0 0 10px 0', fontSize: '28px' }}>AI Exam Helper Notes</h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Specially Designed by <strong>Hasnain Qureshi</strong>, LJCCA Student</p>
        </div>
        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #3b82f6', marginBottom: '30px' }}>
          <strong style={{ color: '#334155' }}>Question:</strong> {printData.query}
        </div>
        <div className="pdf-markdown-body" style={{ lineHeight: '1.6', fontSize: '14px', color: '#1e293b' }}>
          <ReactMarkdown>{printData.answer}</ReactMarkdown>
        </div>
        <div style={{ marginTop: '50px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
          Generated for university exam preparation.
        </div>
      </div>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} AI Exam Helper. Built for university students.</p>
      </footer>
    </div>
  );
}
