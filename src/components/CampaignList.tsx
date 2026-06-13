import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot, getDocs, where } from "firebase/firestore";
import { db } from "../firebase";
import { Campaign, Recipient } from "../types";
import { History, Eye, CheckCircle2, XCircle, Clock, Search, ChevronRight, User } from "lucide-react";

interface CampaignListProps {
  onSelectCampaign: (campaign: Campaign) => void;
  userId: string;
}

const formatCampaignDate = (createdAt: any) => {
  if (!createdAt) return "Unknown Date";
  if (typeof createdAt === "object" && typeof createdAt.toDate === "function") {
    return createdAt.toDate().toLocaleDateString();
  }
  if (typeof createdAt === "object" && createdAt.seconds !== undefined) {
    return new Date(createdAt.seconds * 1000).toLocaleDateString();
  }
  const dateObj = new Date(createdAt);
  return isNaN(dateObj.getTime()) ? "Unknown Date" : dateObj.toLocaleDateString();
};

export default function CampaignList({ onSelectCampaign, userId }: CampaignListProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampId, setSelectedCampId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipFilter, setRecipFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  // Read Campaigns collection in real-time
  useEffect(() => {
    if (!userId) {
      setCampaigns([]);
      setLoading(false);
      return;
    }

    const campaignsRef = collection(db, "campaigns");
    // Securely query only documents created by the logged-in user to comply with Firestore rules
    const q = query(campaignsRef, where("createdBy", "==", userId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Campaign[] = [];
        snapshot.forEach((doc) => {
          list.push({ ...doc.data(), id: doc.id } as Campaign);
        });

        // Sort descending in memory by createdAt to avoid any composite index requirements
        list.sort((a, b) => {
          const getMs = (val: any) => {
            if (!val) return 0;
            if (typeof val.toDate === "function") return val.toDate().getTime();
            if (val.seconds !== undefined) return val.seconds * 1000;
            return new Date(val).getTime() || 0;
          };
          return getMs(b.createdAt) - getMs(a.createdAt);
        });

        setCampaigns(list);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore loading error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  // Load recipients subcollection for the selected campaign
  useEffect(() => {
    if (!selectedCampId) {
      setRecipients([]);
      return;
    }

    const recipsRef = collection(db, "campaigns", selectedCampId, "recipients");
    onSnapshot(
      recipsRef,
      (snapshot) => {
        const list: Recipient[] = [];
        snapshot.forEach((doc) => {
          list.push({ ...doc.data(), id: doc.id } as Recipient);
        });
        setRecipients(list);
      },
      (error) => {
        console.error("Failed to load recipients log:", error);
      }
    );
  }, [selectedCampId]);

  const selectCampaign = (camp: Campaign) => {
    setSelectedCampId(camp.id);
    onSelectCampaign(camp);
  };

  const getStatusBadge = (status: Campaign["status"]) => {
    switch (status) {
      case "draft":
        return <span className="bg-zinc-950 text-white px-2.5 py-1 text-xs font-bold rounded-full border border-purple-900/50">Draft</span>;
      case "sending":
        return <span className="bg-purple-950/40 text-purple-300 px-2.5 py-1 text-xs font-bold rounded-full border border-purple-900/45 animate-pulse">Sending</span>;
      case "completed":
        return <span className="bg-emerald-950 text-emerald-400 px-2.5 py-1 text-xs font-bold rounded-full border border-emerald-900">Completed</span>;
      case "failed":
        return <span className="bg-rose-950 text-rose-400 px-2.5 py-1 text-xs font-bold rounded-full border border-rose-900">Failed</span>;
    }
  };

  const getRecipientStatusBadge = (status: Recipient["status"]) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-300 bg-zinc-950 px-2 py-0.5 rounded-md border border-purple-900/40">
            <Clock className="w-3 h-3 text-slate-400" /> Pending
          </span>
        );
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-200 bg-emerald-950 px-2 py-0.5 rounded-md border border-emerald-900/40">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Sent
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-rose-200 bg-rose-950 px-2 py-0.5 rounded-md border border-rose-900/40">
            <XCircle className="w-3 h-3 text-rose-400" /> Failed
          </span>
        );
    }
  };

  const src_list_val = recipients.filter((r) => {
    const sTerm = recipFilter.toLowerCase();
    return r.name.toLowerCase().includes(sTerm) || r.email.toLowerCase().includes(sTerm) || (r.error && r.error.toLowerCase().includes(sTerm));
  });

  const filteredCampaigns = campaigns.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div id="campaigns-history-dashboard" className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      
      {/* List layout of completed campaigns */}
      <div className="xl:col-span-1 bg-zinc-950 border border-purple-900/40 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white font-sans tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-purple-400 animate-pulse" />
            Campaign Archive Logs
          </h3>
          <span className="text-xs bg-black text-white border border-purple-950 px-2 py-0.5 rounded-md font-mono font-medium">
            {campaigns.length} total
          </span>
        </div>

        {/* Search Input bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-450" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-purple-950 rounded-xl text-xs bg-black text-white placeholder-white/40 focus:bg-zinc-900 hover:border-purple-800 transition-colors focus:outline-none"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-white/60">Loading campaign archive streams...</div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="py-12 text-center text-xs text-white/50 italic">No saved campaigns match.</div>
        ) : (
          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {filteredCampaigns.map((camp) => (
              <button
                key={camp.id}
                type="button"
                onClick={() => selectCampaign(camp)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all duration-150 flex items-center justify-between group cursor-pointer ${
                  selectedCampId === camp.id
                    ? "bg-purple-950/45 border-purple-900/50 shadow-md"
                    : "bg-black border-purple-955 hover:border-purple-800 hover:bg-purple-950/10"
                }`}
              >
                <div className="space-y-1.5 min-w-0 pr-2">
                  <div className="font-bold text-xs text-white group-hover:text-purple-300 transition-colors duration-150 truncate">
                    {camp.name}
                  </div>
                  <div className="text-[11px] text-white/80 truncate">{camp.subject}</div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-white/50 mt-1">
                    <span>{formatCampaignDate(camp.createdAt)}</span>
                    <span>•</span>
                    <span>{camp.totalCount} recipients</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {getStatusBadge(camp.status)}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recipient level logs inspection */}
      <div className="xl:col-span-2 bg-zinc-950 border border-purple-900/40 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
        {selectedCampId ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-purple-955">
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-[#c084fc] font-sans">Campaign Detail Explorer</p>
                <h4 className="text-sm font-bold text-white truncate mt-0.5">
                  {campaigns.find(c => c.id === selectedCampId)?.name}
                </h4>
                <p className="text-xs text-white/85 font-sans truncate mt-0.5">
                  Email Subject: <span className="font-semibold text-white">{campaigns.find(c => c.id === selectedCampId)?.subject}</span>
                </p>
              </div>

              {/* Statistical distribution block */}
              <div className="flex items-center gap-2 font-sans text-xs">
                <div className="bg-black border border-purple-950 px-3 py-1.5 rounded-xl text-center min-w-[55px]">
                  <div className="font-mono font-bold text-white">{recipients.length}</div>
                  <div className="text-[9.5px] text-white/60 font-bold uppercase tracking-wider">Total</div>
                </div>
                <div className="bg-emerald-950 border border-emerald-900 px-3 py-1.5 rounded-xl text-center min-w-[55px]">
                  <div className="font-mono font-bold text-emerald-300">
                    {recipients.filter(r => r.status === "sent").length}
                  </div>
                  <div className="text-[9.5px] text-emerald-400 font-bold uppercase tracking-wider">Sent</div>
                </div>
                <div className="bg-rose-950 border border-rose-900 px-3 py-1.5 rounded-xl text-center min-w-[55px]">
                  <div className="font-mono font-bold text-rose-300">
                    {recipients.filter(r => r.status === "failed").length}
                  </div>
                  <div className="text-[9.5px] text-rose-450 font-bold uppercase tracking-wider">Failed</div>
                </div>
              </div>
            </div>

            {/* Recipient filter searching bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-505" />
                <input
                  type="text"
                  placeholder="Filter recipients by name, email, error..."
                  value={recipFilter}
                  onChange={(e) => setRecipFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#000] border border-purple-955 text-white rounded-xl hover:border-purple-855 focus:outline-none text-[11px] placeholder-white/40"
                />
              </div>

              <div className="text-white/80 text-[11px] font-mono">
                Showing {src_list_val.length} of {recipients.length} entries
              </div>
            </div>

            {/* Recipients list table */}
            <div className="border border-purple-955 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto bg-black">
              {src_list_val.length === 0 ? (
                <div className="py-12 text-center text-xs text-white/60 italic">
                  No tracking logs matched this filter.
                </div>
              ) : (
                <table className="w-full text-left border-collapse font-sans text-xs">
                  <thead className="bg-[#120924]/60 border-b border-purple-955 text-white uppercase font-bold text-[9px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Participant</th>
                      <th className="p-3">Email Address</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 pr-4 text-right">Delivery Timestamp / Info</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-955/40">
                    {src_list_val.map((recip) => (
                      <tr key={recip.id} className="hover:bg-purple-950/20 transition-all">
                        <td className="p-3 pl-4 font-bold text-white flex items-center gap-1.5 font-sans">
                          <User className="w-3.5 h-3.5 text-purple-400" />
                          {recip.name}
                        </td>
                        <td className="p-3 text-white/90 font-mono text-[11px]">{recip.email}</td>
                        <td className="p-3">{getRecipientStatusBadge(recip.status)}</td>
                        <td className="p-3 pr-4 text-right">
                          {recip.error ? (
                            <span className="text-rose-350 font-mono text-[10px] bg-rose-950/50 px-1.5 py-0.5 rounded border border-rose-900/40">
                              {recip.error}
                            </span>
                          ) : recip.sentAt ? (
                            <span className="text-white/80 font-mono text-[11px]">
                              {new Date(recip.sentAt).toLocaleTimeString()}
                            </span>
                          ) : (
                            <span className="text-white/40 font-mono italic">Waiting...</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div className="py-24 text-center rounded-xl border border-dashed border-purple-900/40 bg-zinc-950/20 text-white/50 italic flex flex-col items-center justify-center gap-2">
            <History className="w-7 h-7 text-purple-400 stroke-1.5 animate-pulse" />
            <div className="text-xs font-sans text-white/90">Select a Campaign from the Archive to explore live delivery receipts and visual diagnostics.</div>
          </div>
        )}
      </div>

    </div>
  );
}
