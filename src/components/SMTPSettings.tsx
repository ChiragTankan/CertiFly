import React, { useState, useEffect } from "react";
import { Mail, Shield, Eye, EyeOff, Save, Sparkles, Check } from "lucide-react";
import { SMTPConfig } from "../types";

interface SMTPSettingsProps {
  currentUser: any;
  onConfigChange: (config: SMTPConfig) => void;
}

export default function SMTPSettings({ currentUser, onConfigChange }: SMTPSettingsProps) {
  const [config, setConfig] = useState<SMTPConfig>({
    host: "",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    fromName: currentUser?.displayName || "Event Team",
    fromEmail: currentUser?.email || "organizer@event.com",
    useRealSMTP: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [saveLocal, setSaveLocal] = useState(true);
  const [isSavedAlert, setIsSavedAlert] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem("bulk_email_smtp_cfg");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig(parsed);
        onConfigChange(parsed);
      } catch (e) {
        console.error("Failed to parse saved SMTP config", e);
      }
    } else {
      const initial = {
        host: "",
        port: 587,
        secure: false,
        user: "",
        pass: "",
        fromName: currentUser?.displayName || "Event Team",
        fromEmail: currentUser?.email || "organizer@event.com",
        useRealSMTP: false,
      };
      setConfig(initial);
      onConfigChange(initial);
    }
  }, [currentUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let newValue: any = value;

    if (type === "checkbox") {
      newValue = (e.target as HTMLInputElement).checked;
    } else if (name === "port") {
      newValue = Number(value) || 587;
    }

    const updated = {
      ...config,
      [name]: newValue,
    };
    setConfig(updated);
    onConfigChange(updated);

    if (saveLocal) {
      localStorage.setItem("bulk_email_smtp_cfg", JSON.stringify(updated));
    }
  };

  const toggleSMTPMode = (useReal: boolean) => {
    const updated = {
      ...config,
      useRealSMTP: useReal,
    };
    setConfig(updated);
    onConfigChange(updated);

    if (saveLocal) {
      localStorage.setItem("bulk_email_smtp_cfg", JSON.stringify(updated));
    }

    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 2000);
  };

  const handleManualSave = () => {
    localStorage.setItem("bulk_email_smtp_cfg", JSON.stringify(config));
    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 2000);
  };

  return (
    <div id="smtp-settings-section" className="bg-zinc-950 border border-purple-900/40 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 id="smtp-config-title" className="text-base font-bold text-white font-sans tracking-tight flex items-center gap-2">
            <Mail className="w-5 h-5 text-purple-400 animate-pulse" />
            SMTP Email Delivery Setup
          </h2>
          <p className="text-xs text-white/80 font-sans mt-0.5">
            Configure how bulk messages are sent: simulated dry-runs or real mail delivery.
          </p>
        </div>

        {/* Real vs Sandbox Toggle Tabs */}
        <div className="flex bg-black p-1 border border-purple-955 rounded-xl shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => toggleSMTPMode(false)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-sans transition-all duration-250 cursor-pointer ${
              !config.useRealSMTP
                ? "bg-purple-650 text-white shadow-md"
                : "text-white/60 hover:text-white"
            }`}
          >
            Sandbox (Dry Run)
          </button>
          <button
            type="button"
            onClick={() => toggleSMTPMode(true)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-sans transition-all duration-250 cursor-pointer ${
              config.useRealSMTP
                ? "bg-purple-650 text-white shadow-md"
                : "text-white/60 hover:text-white"
            }`}
          >
            Real SMTP Server
          </button>
        </div>
      </div>

      {!config.useRealSMTP ? (
        <div className="bg-purple-950/30 rounded-xl p-4 border border-purple-900/40 text-purple-200 text-xs font-sans flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold text-white text-xs">High-Fidelity Sandbox Mode is Active</p>
            <p className="text-white/90 leading-relaxed text-[11px]">
              No SMTP credentials required! You can draft templates, visually place coordinate placeholders on certificates, and launch bulk campaigns. The background pipeline renders authentic certificates, processes your participant lists, and provides live delivery progress directly inside your campaign logs.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white">SMTP Host / Server</label>
              <input
                type="text"
                name="host"
                placeholder="e.g. smtp.gmail.com or smtp.sendgrid.net"
                value={config.host}
                onChange={handleChange}
                className="w-full px-3.5 py-2 bg-black border border-purple-955 rounded-xl text-xs text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-purple-500 hover:border-purple-800 transition-all duration-150"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white">Port</label>
                <input
                  type="number"
                  name="port"
                  placeholder="587"
                  value={config.port}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2 bg-black border border-purple-955 rounded-xl text-xs text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-purple-500 hover:border-purple-800 transition-all duration-150"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-white">Security SSL/TLS</label>
                <div className="flex items-center h-9">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="secure"
                      checked={config.secure}
                      onChange={handleChange}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#120924] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-[#000] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#1d0f3a] after:border peer-checked:after:border-[#000] after:rounded-full after:h-4 after:width-4 after:transition-all peer-checked:bg-purple-650 animate-all"></div>
                    <span className="ml-2 text-xs text-white font-bold">Use SSL</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white">SMTP Username</label>
              <input
                type="text"
                name="user"
                placeholder="e.g. key@domain.com or API_User"
                value={config.user}
                onChange={handleChange}
                className="w-full px-3.5 py-2 bg-black border border-purple-955 rounded-xl text-xs text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-purple-500 hover:border-purple-800 transition-all duration-150"
              />
            </div>

            <div className="space-y-1.5 relative">
              <label className="text-xs font-bold text-white">SMTP Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="pass"
                  placeholder="••••••••••••••••"
                  value={config.pass}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2 bg-black border border-purple-955 rounded-xl text-xs text-white pr-10 placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-purple-500 hover:border-purple-800 transition-all duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-purple-305 hover:text-white transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white">Sender Name</label>
              <input
                type="text"
                name="fromName"
                placeholder="My Event Name"
                value={config.fromName}
                onChange={handleChange}
                className="w-full px-3.5 py-2 bg-black border border-purple-955 rounded-xl text-xs text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-purple-500 hover:border-purple-800 transition-all duration-150"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white">Sender Email Address</label>
              <input
                type="email"
                name="fromEmail"
                placeholder="organizer@event.com"
                value={config.fromEmail}
                onChange={handleChange}
                className="w-full px-3.5 py-2 bg-black border border-purple-955 rounded-xl text-xs text-white placeholder-white/45 focus:outline-none focus:ring-1 focus:ring-purple-500 hover:border-purple-800 transition-all duration-150"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-purple-955">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveLocal}
                onChange={(e) => {
                  setSaveLocal(e.target.checked);
                  if (!e.target.checked) {
                    localStorage.removeItem("bulk_email_smtp_cfg");
                  } else {
                    localStorage.setItem("bulk_email_smtp_cfg", JSON.stringify(config));
                  }
                }}
                className="w-4 h-4 text-purple-650 bg-black border-purple-955 rounded-xs focus:ring-purple-500 focus:ring-offset-black"
              />
              <span className="text-xs text-white/80 font-sans">Save details on this secure machine browser</span>
            </label>

            <button
              type="button"
              onClick={handleManualSave}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-black hover:bg-zinc-900 border border-purple-900/40 text-purple-400 hover:scale-[1.01] transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              Store Settings
            </button>
          </div>
        </div>
      )}

      {isSavedAlert && (
        <div className="mt-3 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-950/50 text-emerald-400 border border-emerald-900/40 text-xs font-sans">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          Settings Saved Successfully!
        </div>
      )}
    </div>
  );
}
