'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  BarChart3,
  CheckCircle,
  ChevronRight,
  Download,
  FileText,
  MessageSquare,
  Scale,
  Send,
  Upload,
  X,
} from 'lucide-react'
import axios from 'axios'

type ChatMessage = { role: 'user' | 'assistant'; content: string }
type PolicyItem = {
  document_id: string
  policy_name?: string
  country?: string
  relevance_score?: number
}
type LegalReport = {
  validity_score?: number
  risk_level?: string
  executive_summary?: string
  compliance_scores?: Record<string, number>
  recommendations?: string[]
  pros?: string[]
  cons?: string[]
  policy_relevance?: PolicyItem[]
}

const countries = ['Europe', 'Australia', 'USA', 'India']
const domains = ['AI', 'Healthcare', 'Fintech', 'Crypto', 'Biotech', 'Consumer Apps', 'Insurance']

export default function LegalCopilotDashboard() {
  const [productDescription, setProductDescription] = useState('')
  const [selectedCountry, setSelectedCountry] = useState('')
  const [selectedDomain, setSelectedDomain] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [legalReport, setLegalReport] = useState<LegalReport | null>(null)
  const [error, setError] = useState('')

  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const readAxiosError = (fallback: string, err: unknown) => {
    if (axios.isAxiosError(err)) {
      return (err.response?.data as { error?: string } | undefined)?.error || fallback
    }
    return fallback
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    setError('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await axios.post<{ extracted_text?: string }>('http://localhost:5000/upload', formData)
      setProductDescription(response.data.extracted_text || '')
    } catch (err) {
      setError(readAxiosError('Failed to extract text from file', err))
    }
  }

  const handleAnalyze = async () => {
    if (!productDescription.trim()) {
      setError('Please provide a product description')
      return
    }

    setIsAnalyzing(true)
    setError('')

    try {
      const response = await axios.post<LegalReport>('http://localhost:5000/analyze', {
        product_description: productDescription,
        country: selectedCountry,
        domain: selectedDomain,
      })
      setLegalReport(response.data)
      setChatMessages([
        {
          role: 'assistant',
          content: `Analysis complete. Validity score: ${response.data.validity_score ?? 0}/100 and risk level: ${response.data.risk_level || 'Unknown'}.\n\n${response.data.executive_summary || ''}\n\nAsk me any follow-up legal question.`,
        },
      ])
    } catch (err) {
      setError(readAxiosError('Analysis failed', err))
    } finally {
      setIsAnalyzing(false)
    }
  }

  const sendChat = async () => {
    if (!chatInput.trim() || isChatLoading) return
    const userMsg = chatInput.trim()
    const newHistory = [...chatMessages, { role: 'user' as const, content: userMsg }]

    setChatInput('')
    setChatMessages(newHistory)
    setIsChatLoading(true)

    try {
      const res = await axios.post<{ reply: string }>('http://localhost:5000/chat', {
        message: userMsg,
        context: legalReport || {},
        product_description: productDescription,
        history: newHistory.slice(-10),
      })
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }])
    } catch {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: 'I ran into an error. Please try again.' }])
    } finally {
      setIsChatLoading(false)
    }
  }

  const downloadPolicy = async (documentId: string, policyName: string) => {
    try {
      const response = await axios.get(`http://localhost:5000/policy/${documentId}`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `policy_${policyName.replace(/\s+/g, '_')}.txt`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setError('Failed to download policy document')
    }
  }

  const getRiskBadgeClass = (level?: string) => {
    const risk = level?.toLowerCase()
    if (risk === 'high') return 'bg-rose-100 text-rose-700'
    if (risk === 'medium') return 'bg-amber-100 text-amber-700'
    if (risk === 'low') return 'bg-emerald-100 text-emerald-700'
    return 'bg-slate-100 text-slate-700'
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f8fbf8] via-white to-[#edf5ed] text-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 rounded-3xl border border-[#d7e5d6] bg-white/90 p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 inline-flex items-center rounded-full bg-[#edf5ed] px-3 py-1 text-xs font-semibold text-[#3f6b4b]">
                Legal Intelligence Workspace
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">LexGuard Compliance Platform</h1>
              <p className="mt-2 text-sm text-slate-600">Upload your project, run legal feasibility analysis, and review policy relevance.</p>
            </div>
            <Link
              href="/explore-policy"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#b8cfb9] bg-[#eef6ee] px-4 py-2 text-sm font-semibold text-[#325b3d] transition hover:bg-[#e1efe2]"
            >
              Open Explore Policy
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <article className="rounded-3xl border border-[#d7e5d6] bg-white p-6 shadow-sm lg:col-span-2">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
              <Upload className="h-5 w-5 text-[#3f6b4b]" />
              Upload Project
            </h2>

            <div className="space-y-4">
              <textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                className="h-40 w-full rounded-2xl border border-[#d5e2d4] bg-[#fbfdfb] p-4 text-sm outline-none transition focus:border-[#8eb490] focus:ring-2 focus:ring-[#d4e8d4]"
                placeholder="Describe your product idea, user flow, data usage, market, and monetization model..."
              />

              <div className="rounded-2xl border border-dashed border-[#b8cfb9] bg-[#f7fbf7] p-4">
                <label className="mb-2 block text-sm font-medium text-slate-700">Upload Document (PDF/DOCX)</label>
                <input
                  type="file"
                  accept=".pdf,.docx"
                  onChange={handleFileUpload}
                  className="w-full rounded-xl border border-[#d5e2d4] bg-white p-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-[#4e7d5a] file:px-3 file:py-2 file:text-white hover:file:bg-[#3f6b4b]"
                />
                {uploadedFile && <p className="mt-2 text-xs text-slate-500">Uploaded: {uploadedFile.name}</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="rounded-xl border border-[#d5e2d4] bg-white p-3 text-sm outline-none transition focus:border-[#8eb490]"
                >
                  <option value="">Select Country</option>
                  {countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="rounded-xl border border-[#d5e2d4] bg-white p-3 text-sm outline-none transition focus:border-[#8eb490]"
                >
                  <option value="">Select Domain</option>
                  {domains.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="inline-flex w-full items-center justify-center rounded-xl bg-[#4e7d5a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#3f6b4b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Legal Feasibility'}
              </button>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-[#d7e5d6] bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
              <FileText className="h-5 w-5 text-[#3f6b4b]" />
              Policy Preview
            </h2>
            {legalReport?.policy_relevance && legalReport.policy_relevance.length > 0 ? (
              <div className="space-y-3">
                {legalReport.policy_relevance.slice(0, 4).map((policy, index) => (
                  <div key={`${policy.document_id}-${index}`} className="rounded-2xl border border-[#e1ece0] bg-[#f9fcf9] p-3">
                    <h3 className="text-sm font-semibold text-slate-800">{policy.policy_name || policy.document_id}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {policy.country || 'Global'} | Relevance {((policy.relevance_score || 0) * 100).toFixed(1)}%
                    </p>
                    <button
                      onClick={() => downloadPolicy(policy.document_id, policy.policy_name || policy.document_id)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#3f6b4b] hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#cfe0cf] bg-[#f7fbf7] p-8 text-center text-sm text-slate-500">
                Policy preview will appear after running analysis.
              </div>
            )}
          </article>
        </section>

        {legalReport && (
          <section className="mt-8 space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <article className="rounded-3xl border border-[#d7e5d6] bg-white p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <BarChart3 className="h-5 w-5 text-[#3f6b4b]" />
                  Compliance Report
                </h3>
                <p className="text-3xl font-bold text-[#2f5d3a]">{legalReport.validity_score ?? 0}/100</p>
                <p className="mb-4 text-xs text-slate-500">Overall Validity Score</p>
                {Object.entries(legalReport.compliance_scores || {}).map(([key, value]) => (
                  <div key={key} className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="capitalize text-slate-600">{key.replaceAll('_', ' ')}</span>
                      <span className="font-semibold text-slate-800">{value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#e6efe6]">
                      <div className="h-2 rounded-full bg-[#6e9f78]" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                ))}
              </article>

              <article className="rounded-3xl border border-[#d7e5d6] bg-white p-6 shadow-sm">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <AlertCircle className="h-5 w-5 text-[#3f6b4b]" />
                  Risk Analysis
                </h3>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getRiskBadgeClass(legalReport.risk_level)}`}>
                  {legalReport.risk_level || 'Unknown'}
                </span>
                <div className="mt-4 space-y-3 text-sm">
                  <div>
                    <p className="mb-1 font-semibold text-emerald-700">Advantages</p>
                    {(legalReport.pros || []).map((pro, i) => (
                      <p key={`pro-${i}`} className="text-slate-600">
                        - {pro}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1 font-semibold text-rose-700">Challenges</p>
                    {(legalReport.cons || []).map((con, i) => (
                      <p key={`con-${i}`} className="text-slate-600">
                        - {con}
                      </p>
                    ))}
                  </div>
                </div>
              </article>

              <article className="rounded-3xl border border-[#d7e5d6] bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-lg font-semibold">
                    <CheckCircle className="h-5 w-5 text-[#3f6b4b]" />
                    Recommendations
                  </h3>
                  <button
                    onClick={() => setChatOpen(true)}
                    className="rounded-lg bg-[#4e7d5a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3f6b4b]"
                  >
                    Ask Lawyer
                  </button>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {(legalReport.recommendations || []).map((rec, i) => (
                    <p key={`rec-${i}`} className="rounded-xl bg-[#f4faf4] p-3 text-sm text-slate-700">
                      {i + 1}. {rec}
                    </p>
                  ))}
                </div>
              </article>
            </div>

            <article className="rounded-3xl border border-[#d7e5d6] bg-white p-6 shadow-sm">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">Executive Summary</h3>
              <p className="text-sm leading-7 text-slate-600">{legalReport.executive_summary || 'No summary generated.'}</p>
            </article>
          </section>
        )}
      </div>

      {chatOpen && (
        <div className="fixed bottom-0 right-0 z-50 w-full max-w-lg p-4 md:p-6" style={{ height: 'min(650px, 100dvh)' }}>
          <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-[#d7e5d6] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e4ede3] p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[#4e7d5a] p-2 text-white">
                  <Scale className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Legal Counsel</p>
                  <p className="text-xs text-slate-500">Ask anything about your compliance analysis</p>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-slate-500 transition hover:text-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-[#fcfefc] p-4">
              {chatMessages.map((msg, i) => (
                <div key={`msg-${i}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                      msg.role === 'user' ? 'rounded-br-sm bg-[#4e7d5a] text-white' : 'rounded-bl-sm bg-[#eef6ee] text-slate-700'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading && <p className="text-xs text-slate-500">Counsel is drafting a response...</p>}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-[#e4ede3] p-4">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="Ask your legal counsel..."
                  className="flex-1 rounded-xl border border-[#d5e2d4] bg-white p-3 text-sm outline-none focus:border-[#8eb490]"
                />
                <button
                  onClick={sendChat}
                  disabled={isChatLoading || !chatInput.trim()}
                  className="rounded-xl bg-[#4e7d5a] px-4 text-white transition hover:bg-[#3f6b4b] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!chatOpen && legalReport && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-[#4e7d5a] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#3f6b4b]"
        >
          <MessageSquare className="h-4 w-4" />
          Ask Legal Counsel
        </button>
      )}
    </main>
  )
}
