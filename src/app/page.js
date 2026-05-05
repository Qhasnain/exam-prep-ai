"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

export default function Home() {
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileBase64, setFileBase64] = useState("");
  const [mimeType, setMimeType] = useState("");
  
  const [printData, setPrintData] = useState({ query: "", answer: "" });

  useEffect(() => {
    const handlePaste = (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const file = items[i].getAsFile();
            if (file) {
              setFileName("Pasted Image (" + file.type.split('/')[1] + ")");
              setMimeType(file.type);
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64String = reader.result.split(',')[1];
                setFileBase64(base64String);
              };
              reader.readAsDataURL(file);
              // We do NOT call preventDefault() here because the user might be pasting text into the input box
              break;
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
    if (!query.trim() && !fileBase64) return;

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
          prompt: query || "Please explain this image.",
          fileData: fileBase64 || null,
          mimeType: mimeType || null
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate answer");
      }

      const newItem = {
        id: Date.now(),
        query: query || "Image Analysis Request",
        answer: data.answer,
        attachedFile: fileName
      };

      setHistory((prev) => [...prev, newItem]);
      setQuery("");
      setFileName("");
      setFileBase64("");
      setMimeType("");
      
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
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
      setMimeType(file.type);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        setFileBase64(base64String);
      };
      reader.readAsDataURL(file);
    } else {
      setFileName("");
      setFileBase64("");
      setMimeType("");
    }
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
      <header className="header">
        <h1>AI Exam Helper</h1>
        <p>Your ultimate university study companion. Ask any question and get a simplified, exam-ready answer perfect for assignments and tests.</p>
        <div className="designer-badge">
          <span className="badge-text">Specially Designed by <strong>Hasnain</strong>, LJCCA Student</span>
        </div>
      </header>

      {/* CHAT HISTORY */}
      <div className="history-container" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginBottom: '2rem' }}>
        {history.map((item) => (
          <div key={item.id} className="results-container" style={{ animation: 'fadeIn 0.5s ease' }}>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
              <p style={{ margin: 0, fontWeight: 'bold', color: '#f8fafc' }}>{item.query}</p>
              {item.attachedFile && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#93c5fd' }}>📎 Attached: {item.attachedFile}</p>
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
        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="text"
            className="search-input"
            placeholder="Ask a new question (e.g., Explain the OSI model...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="search-button" disabled={loading || (!query.trim() && !fileBase64)}>
            {loading ? "Thinking..." : "Send Request"}
          </button>
        </form>
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ cursor: 'pointer', color: '#93c5fd', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(59, 130, 246, 0.3)', transition: 'background 0.2s' }}>
            <span>📄 Upload Notes or 🖼️ Image</span>
            <input type="file" accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={handleFileChange} style={{ display: 'none' }} disabled={loading} />
          </label>
          {fileName && <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Attached: {fileName}</span>}
        </div>
      </div>

      {/* Hidden container specifically styled for PDF export */}
      <div id="print-container" style={{ display: 'none', background: 'white', color: 'black', padding: '40px', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #3b82f6', paddingBottom: '20px', marginBottom: '30px' }}>
          <h1 style={{ color: '#1e3a8a', margin: '0 0 10px 0', fontSize: '28px' }}>AI Exam Helper Notes</h1>
          <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Specially Designed by <strong>Hasnain</strong>, LJCCA Student</p>
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
