import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { boardService, boardDetailService, leagueService, rosterService, tournamentService, userService, scoringService } from '../services/cricketSocialService';
import { fetchCountries, fetchStates, fetchCities, fetchCountryPhoneCodes } from '../services/locationService';
import type { Umpire, Ground, Tournament, Match, LeagueApplication, Invoice } from '../types';
import { useAuthStore } from '../store/slices/authStore';
import Navbar from '../components/Navbar';
import { scoringHub } from '../services/scoringHub';

type LeagueTab = 'dashboard' | 'umpire-list' | 'ground-list' | 'schedule' | 'tournaments' | 'applications' | 'invoices' | 'cancel-game' | 'edit';

type SidebarSection = 'umpires' | 'grounds' | 'trophy' | 'schedules';

/** Sanitize text input: no leading spaces, auto-capitalize first letter, strip special characters */
const sanitizeTextInput = (value: string, allowAddressChars = false): string => {
  let v = value.replace(/^\s+/, '');
  if (allowAddressChars) {
    v = v.replace(/[^a-zA-Z0-9\s,.\/#\-]/g, '');
  } else {
    v = v.replace(/[^a-zA-Z0-9\s]/g, '');
  }
  if (v.length > 0) {
    v = v.charAt(0).toUpperCase() + v.slice(1);
  }
  return v;
};

/** Ensure a date string from startAtUtc is always parsed as UTC (append Z if missing) */
const ensureUtc = (s: string): string => {
  if (!s) return s;
  const t = s.trim();
  if (t.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(t)) return t;
  return t + 'Z';
};

/** Format date consistently as DD/MM/YYYY, HH:mm */
const formatDateTime = (d: string | Date): string => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
};

/** Format date consistently as DD/MM/YYYY */
const formatDateOnly = (d: string | Date): string => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '-';
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const sidebarSections: { id: SidebarSection; label: string; items: { id: LeagueTab; label: string }[] }[] = [
  {
    id: 'umpires', label: 'UMPIRES',
    items: [
      { id: 'umpire-list', label: 'Umpire List' },
    ],
  },
  {
    id: 'grounds', label: 'GROUNDS',
    items: [
      { id: 'ground-list', label: 'Ground List' },
    ],
  },
  {
    id: 'trophy', label: 'TOURNAMENTS',
    items: [
      { id: 'tournaments', label: 'Tournament List' },
    ],
  },
  {
    id: 'schedules', label: 'SCHEDULES AND RESULTS',
    items: [
      { id: 'schedule', label: 'Schedule List' },
      { id: 'cancel-game', label: 'Cancel Game by Date' },
    ],
  },
];

export default function LeagueManagementPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Map tab to its parent sidebar section
  const tabToSection = (tab: LeagueTab): SidebarSection | null => {
    for (const s of sidebarSections) {
      if (s.items.some(i => i.id === tab)) return s.id;
    }
    return null;
  };

  const initialTab = (searchParams.get('tab') as LeagueTab) || 'dashboard';
  const initialSection = tabToSection(initialTab);

  const [activeTab, setActiveTabState] = useState<LeagueTab>(initialTab);
  const [expandedSections, setExpandedSections] = useState<SidebarSection[]>(initialSection ? [initialSection] : []);
  const [pendingNav, setPendingNav] = useState<{ tab: LeagueTab; section: SidebarSection } | null>(null);
  const dirtyRef = useRef(false);
  const qc = useQueryClient();
  const { data: board } = useQuery({ queryKey: ['board', boardId], queryFn: () => boardService.getById(boardId!).then(r => r.data), enabled: !!boardId });

  // Block browser refresh/close when there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Wrapper to sync activeTab with URL search params
  const setActiveTab = (tab: LeagueTab) => {
    setActiveTabState(tab);
    if (tab === 'dashboard') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };

  const onDirtyChange = (dirty: boolean) => { dirtyRef.current = dirty; };

  const toggleSection = (section: SidebarSection) => {
    setExpandedSections(prev =>
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };

  const handleTabClick = (tab: LeagueTab, section: SidebarSection) => {
    if (tab === activeTab) return;
    if (dirtyRef.current) {
      setPendingNav({ tab, section });
      return;
    }
    setActiveTab(tab);
    if (!expandedSections.includes(section)) {
      setExpandedSections(prev => [...prev, section]);
    }
  };

  const confirmNavigation = () => {
    if (pendingNav) {
      dirtyRef.current = false;
      setActiveTab(pendingNav.tab);
      if (!expandedSections.includes(pendingNav.section)) {
        setExpandedSections(prev => [...prev, pendingNav.section]);
      }
      setPendingNav(null);
    }
  };

  if (!board) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><div className="w-12 h-12 border-4 border-brand-green border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-gray-100">
      <Navbar title={`League Management - ${board.name}`} backTo="/dashboard" />

      <div className="pt-14 flex">
        {/* Sidebar */}
        <div className="w-64 min-h-screen bg-white border-r shadow-sm fixed left-0 top-14 overflow-y-auto">
          {/* Board Info */}
          <div className="p-4 border-b">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 flex items-center justify-center mb-3">
                {board.logoUrl
                  ? <img src={board.logoUrl} alt="" className="w-16 h-16 object-cover" />
                  : <img src="/images/boardIcon.png" alt="" className="w-12 h-12" />
                }
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-gray-800">{board.name}</span>
                <button
                  onClick={() => {
                    if (dirtyRef.current) {
                      setPendingNav({ tab: 'edit', section: 'umpires' });
                    } else {
                      setActiveTab('edit');
                    }
                  }}
                  className="hover:text-brand-green transition-colors cursor-pointer"
                  title="Edit Board"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Sections */}
          <div className="py-2">
            {sidebarSections.map(section => (
              <div key={section.id} className="border-b last:border-b-0">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  <span>{section.label}</span>
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expandedSections.includes(section.id) ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSections.includes(section.id) && (
                  <div className="pb-2">
                    {section.items.map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id, section.id)}
                        className={`w-full text-left pl-8 pr-4 py-2 text-sm transition-colors ${
                          activeTab === item.id
                            ? 'text-brand-green font-semibold bg-brand-green/5'
                            : 'text-blue-600 hover:text-blue-800 hover:bg-gray-50'
                        }`}
                      >
                        &gt; {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className={`ml-64 flex-1 overflow-x-hidden ${activeTab === 'edit' ? '' : 'p-6'}`}>
          {activeTab === 'dashboard' && <LeagueLandingTab boardId={boardId!} />}
          {activeTab === 'umpire-list' && <UmpireListTab boardId={boardId!} onDirtyChange={onDirtyChange} />}
          {activeTab === 'ground-list' && <GroundListTab boardId={boardId!} onDirtyChange={onDirtyChange} />}
          {activeTab === 'tournaments' && <TournamentsTab boardId={boardId!} onDirtyChange={onDirtyChange} />}
          {activeTab === 'schedule' && <ScheduleTab boardId={boardId!} onDirtyChange={onDirtyChange} />}
          {activeTab === 'cancel-game' && <CancelGameTab boardId={boardId!} />}
          {activeTab === 'applications' && <ApplicationsTab boardId={boardId!} />}
          {activeTab === 'invoices' && <InvoicesTab boardId={boardId!} />}
          {activeTab === 'edit' && (
            <EditLeagueForm
              board={board}
              boardId={boardId!}
              onClose={() => { dirtyRef.current = false; setActiveTab('dashboard'); }}
              onSaved={() => {
                dirtyRef.current = false;
                setActiveTab('dashboard');
                qc.invalidateQueries({ queryKey: ['board', boardId] });
              }}
              onDirtyChange={onDirtyChange}
            />
          )}
        </div>
      </div>

      {/* Unsaved changes warning modal */}
      {pendingNav && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPendingNav(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Unsaved Changes</h3>
              <p className="text-xs text-gray-500 mb-4">You have unsaved changes. Are you sure you want to leave? Any unsaved data will be lost.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setPendingNav(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">Stay</button>
                <button onClick={confirmNavigation} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Discard & Leave</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- EDIT LEAGUE MODAL --
function EditLeagueForm({ board, boardId, onClose, onSaved, onDirtyChange }: { board: any; boardId: string; onClose: () => void; onSaved: () => void; onDirtyChange?: (dirty: boolean) => void }) {
  const [name, setName] = useState(board.name || '');
  const [boardNameError, setBoardNameError] = useState('');
  const [description, setDescription] = useState(board.description || '');
  const [city, setCity] = useState(board.city || '');
  const [state, setState] = useState(board.state || '');
  const [country, setCountry] = useState(board.country || '');
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(board.logoUrl || board.LogoUrl || board.logourl || '');
  const [logoError, setLogoError] = useState<string>('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const qc = useQueryClient();

  // Store original values for dirty comparison
  const [origValues] = useState({
    name: board.name || '',
    description: board.description || '',
    country: board.country || '',
    state: board.state || '',
    city: board.city || '',
    logoPreview: board.logoUrl || board.LogoUrl || board.logourl || '',
  });

  // Location async state
  const [countryList, setCountryList] = useState<string[]>([]);
  const [stateList, setStateList] = useState<string[]>([]);
  const [cityList, setCityList] = useState<string[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);

  // Custom dropdown open/search state
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [countrySearchText, setCountrySearchText] = useState('');
  const [stateSearchText, setStateSearchText] = useState('');
  const [citySearchText, setCitySearchText] = useState('');

  // Co-Owner state
  const [coOwnerSearch, setCoOwnerSearch] = useState('');
  const [showCoOwnerDropdown, setShowCoOwnerDropdown] = useState(false);
  const [selectedCoOwner, setSelectedCoOwner] = useState<{ id: string; firstName: string; lastName: string; email: string } | null>(null);
  const coOwnerManuallyClearedRef = useRef(false);

  // Fetch countries on mount
  useEffect(() => {
    setCountriesLoading(true);
    fetchCountries().then(setCountryList).catch(() => setCountryList([])).finally(() => setCountriesLoading(false));
  }, []);

  // Fetch states when country changes
  useEffect(() => {
    if (!country) { setStateList([]); setCityList([]); return; }
    setStatesLoading(true);
    fetchStates(country).then(setStateList).catch(() => setStateList([])).finally(() => setStatesLoading(false));
  }, [country]);

  // Fetch cities when state changes
  useEffect(() => {
    if (!country || !state) { setCityList([]); return; }
    setCitiesLoading(true);
    fetchCities(country, state).then(setCityList).catch(() => setCityList([])).finally(() => setCitiesLoading(false));
  }, [country, state]);

  // Fetch user list for co-owner dropdown
  const { data: coOwnerUserList, isLoading: coOwnerLoading } = useQuery({
    queryKey: ['usersList'],
    queryFn: async () => {
      const r = await userService.list();
      const raw = r.data as any;
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.users) ? raw.users : Array.isArray(raw?.result) ? raw.result : raw ? [raw] : [];
      return list.map((u: any) => {
        const first = u.firstName || u.name?.split(' ')[0] || u.fullName?.split(' ')[0] || '';
        const last = u.lastName || u.name?.split(' ').slice(1).join(' ') || u.fullName?.split(' ').slice(1).join(' ') || '';
        const email = u.email || u.emailAddress || '';
        return { id: u.id || u.Id || u.userId || u.UserId, firstName: first || email.split('@')[0] || email, lastName: last, email };
      });
    },
  });

  // Pre-select co-owner from board's coOwnerId field only (never from ownerId)
  const coOwnerPreselectedRef = useRef(false);
  useEffect(() => {
    if (coOwnerPreselectedRef.current || !coOwnerUserList || coOwnerManuallyClearedRef.current) return;
    // Check if co-owner was explicitly cleared in a previous save (persisted in boardEdits overlay)
    try {
      const edits = JSON.parse(sessionStorage.getItem('boardEdits') || '{}');
      if (edits[boardId] && (edits[boardId].coOwnerId === null || edits[boardId].coOwnerId === '')) {
        coOwnerPreselectedRef.current = true;
        return;
      }
    } catch {}
    const coOwnerId = board.coOwnerId || board.CoOwnerId || board.coOwnerid || board.co_owner_id || '';
    if (coOwnerId) {
      const match = coOwnerUserList.find((u: any) => u.id === coOwnerId);
      if (match) { coOwnerPreselectedRef.current = true; setSelectedCoOwner({ id: match.id, firstName: match.firstName, lastName: match.lastName, email: match.email }); }
    }
  }, [coOwnerUserList]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Check for duplicate board name
      const boardsRes = await boardService.getMyBoards(1, 100);
      const raw = boardsRes.data as any;
      const allBoards = raw?.items || (Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : []);
      const existingNames = allBoards
        .filter((b: any) => b.id !== boardId)
        .map((b: any) => b.name?.toLowerCase().trim());
      if (existingNames.includes(name.toLowerCase().trim())) {
        throw new Error('Board name already exists. Please create a different name.');
      }
      // ownerId must remain the original owner ? never overwrite with co-owner
      const existingOwnerId = board.ownerId || board.owneriD || board.OwnerId || board.owner_id || board.createdBy || board.userId || board.ownerid || '';
      const resolvedOwnerId = existingOwnerId;
      const payload: any = {
        id: boardId,
        name,
        description,
        isActive: board.isActive ?? board.IsActive ?? true,
        city: city || '',
        state: state || '',
        country: country || '',
        ...(board.address1 ? { address1: board.address1 } : {}),
        ...(board.address2 ? { address2: board.address2 } : {}),
        ...(board.contactNumber ? { contactNumber: board.contactNumber } : {}),
        ...(board.contactEmail ? { contactEmail: board.contactEmail } : {}),
        ...(board.websiteAddress ? { websiteAddress: board.websiteAddress } : {}),
        ownerId: resolvedOwnerId,
        logoUrl: logoPreview,
        coOwnerId: selectedCoOwner ? selectedCoOwner.id : '',
      };
      return boardService.update(boardId, payload).then((r) => r.data);
    },
    onSuccess: async (updatedBoard: any) => {
      const newName = updatedBoard?.name || name;
      const newDescription = updatedBoard?.description ?? description;
      const newCity = updatedBoard?.city ?? city;
      const newState = updatedBoard?.state ?? state;
      const newCountry = updatedBoard?.country ?? country;
      const newLogoUrl = logoPreview; // always use local state  -  this is what the user chose
      const editOverlay = { name: newName, description: newDescription, city: newCity, state: newState, country: newCountry, logoUrl: newLogoUrl, coOwnerId: selectedCoOwner ? selectedCoOwner.id : '' };
      try {
        const pending = JSON.parse(sessionStorage.getItem('boardEdits') || '{}');
        pending[boardId] = editOverlay;
        sessionStorage.setItem('boardEdits', JSON.stringify(pending));
      } catch {}
      const userId = useAuthStore.getState().user?.id;
      qc.setQueryData(['board', boardId], (old: any) => old ? { ...old, ...editOverlay } : updatedBoard || old);
      qc.setQueryData(['myBoards', userId], (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((b: any) => b.id === boardId ? { ...b, ...editOverlay } : b) };
      });
      qc.invalidateQueries({ queryKey: ['myBoards', userId] });
      // Optimistically update league boards list so Affiliate to League dropdown shows updated names immediately
      // Cancel any in-flight refetches first so they don't overwrite our optimistic update
      await qc.cancelQueries({ queryKey: ['allBoardsForLeague'] });
      qc.setQueryData(['allBoardsForLeague'], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((b: any) => b.id === boardId ? { ...b, name: newName } : b);
      });
      // Delayed invalidation so the backend has time to persist the change
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['allBoardsForLeague'] });
      }, 4000);
      onSaved();
    },
    onError: (error: any) => {
      if (error?.message === 'Board name already exists. Please create a different name.') {
        setBoardNameError(error.message);
      } else if (error?.response?.status === 401) {
        alert('Session expired. Please sign in again.');
        useAuthStore.getState().logout();
      } else {
        alert(`Failed to update board. ${error?.response?.data?.title || error?.response?.data?.message || ''}`);
      }
    },
  });

  const hasChanges = name !== origValues.name || description !== origValues.description || country !== origValues.country || state !== origValues.state || city !== origValues.city || logoPreview !== origValues.logoPreview;

  // Report dirty state to parent so sidebar navigation guard works
  useEffect(() => { onDirtyChange?.(hasChanges); }, [hasChanges]);

  return (
    <>
    <div className="bg-white shadow-md p-6 min-h-full w-full">
      <h3 className="font-semibold mb-4">Edit Board</h3>
      {/* Logo Upload */}
      <div className="flex flex-col items-start gap-1 mb-4">
        <p className="text-sm font-medium text-gray-700">Board Logo</p>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden hover:border-brand-green transition-colors cursor-pointer group"
            onClick={() => document.getElementById('edit-league-logo-input')?.click()}>
            {logoPreview ? (
              <img src={logoPreview} alt="Board logo" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center text-gray-400 group-hover:text-brand-green transition-colors px-1">
                <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span className="text-[9px] leading-tight text-center font-medium">Upload Logo</span>
              </div>
            )}
            {logoPreview && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </div>
            )}
          </div>
          {logoPreview && (
            <button className="text-xs text-red-500 hover:text-red-600" onClick={(e) => { e.stopPropagation(); setLogo(null); setLogoPreview(''); }}>Remove</button>
          )}
        </div>
        <p className="text-xs text-gray-400 ml-2">Max 2MB</p>
        {logoError && <p className="text-xs text-red-500 mt-1">{logoError}</p>}
        <input id="edit-league-logo-input" type="file" accept="image/*" className="hidden" onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            if (file.size > 2 * 1024 * 1024) { setLogoError('Logo must be under 2MB'); return; }
            setLogoError('');
            setLogo(file);
            const reader = new FileReader();
            reader.onloadend = () => setLogoPreview(reader.result as string);
            reader.readAsDataURL(file);
          }
        }} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Board Name <span className="text-red-500">*</span></label>
          <input value={name} maxLength={50} onChange={(e) => { setName(e.target.value); setBoardNameError(''); }} className={`input-field ${boardNameError ? 'border-red-500' : ''}`} />
          {boardNameError && <p className="text-xs text-red-500 mt-1">{boardNameError}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <input value="League" disabled className="input-field bg-gray-100 text-gray-500 cursor-not-allowed" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} className="input-field resize-none" rows={3} />
        </div>
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Country <span className="text-red-500">*</span></label>
          {countryDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCountryDropdownOpen(false); setCountrySearchText(''); }} />}
          <div className={`input-field cursor-pointer flex items-center justify-between border-gray-400 ${countriesLoading ? 'bg-gray-50' : ''}`} onClick={() => { if (!countriesLoading) setCountryDropdownOpen(!countryDropdownOpen); }}>
            <span className={country ? 'text-gray-900' : 'text-gray-400'}>{countriesLoading ? 'Loading countries...' : country || ''}</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${countryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
          {countryDropdownOpen && (
            <div className="absolute z-10 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="max-h-80 overflow-y-auto">
                {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).map(c => (
                  <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${country === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`} onClick={() => { setCountry(c); setState(''); setCity(''); setCountryDropdownOpen(false); setCountrySearchText(''); }}>{c}</button>
                ))}
                {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).length === 0 && <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>}
              </div>
              <div className="p-2 border-t border-gray-100"><input type="text" value={countrySearchText} onChange={e => setCountrySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search country..." autoFocus onClick={e => e.stopPropagation()} /></div>
            </div>
          )}
        </div>
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
          {stateDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setStateDropdownOpen(false); setStateSearchText(''); }} />}
          <div className={`input-field flex items-center justify-between border-gray-400 ${!country || statesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`} onClick={() => { if (country && !statesLoading) setStateDropdownOpen(!stateDropdownOpen); }}>
            <span className={state ? 'text-gray-900' : 'text-gray-400'}>{!country ? '' : statesLoading ? 'Loading states...' : state || ''}</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${stateDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
          {stateDropdownOpen && (
            <div className="absolute z-10 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="max-h-80 overflow-y-auto">
                {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).map(s => (
                  <button key={s} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${state === s ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`} onClick={() => { setState(s); setCity(''); setStateDropdownOpen(false); setStateSearchText(''); }}>{s}</button>
                ))}
                {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).length === 0 && <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>}
              </div>
              <div className="p-2 border-t border-gray-100"><input type="text" value={stateSearchText} onChange={e => setStateSearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search state..." autoFocus onClick={e => e.stopPropagation()} /></div>
            </div>
          )}
        </div>
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">District / City <span className="text-red-500">*</span></label>
          {cityDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCityDropdownOpen(false); setCitySearchText(''); }} />}
          <div className={`input-field flex items-center justify-between border-gray-400 ${!state || citiesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`} onClick={() => { if (state && !citiesLoading) setCityDropdownOpen(!cityDropdownOpen); }}>
            <span className={city ? 'text-gray-900' : 'text-gray-400'}>{!state ? '' : citiesLoading ? 'Loading...' : city || ''}</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${cityDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
          {cityDropdownOpen && (
            <div className="absolute z-10 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
              <div className="max-h-80 overflow-y-auto">
                {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).map(c => (
                  <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${city === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`} onClick={() => { setCity(c); setCityDropdownOpen(false); setCitySearchText(''); }}>{c}</button>
                ))}
                {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).length === 0 && <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>}
              </div>
              <div className="p-2 border-t border-gray-100"><input type="text" value={citySearchText} onChange={e => setCitySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search district / city..." autoFocus onClick={e => e.stopPropagation()} /></div>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Co-Owner</label>
          <div className="relative">
            {showCoOwnerDropdown && <div className="fixed inset-0 z-[5]" onClick={() => { setShowCoOwnerDropdown(false); setCoOwnerSearch(''); }} />}
            <div className="input-field cursor-pointer flex items-center justify-between" onClick={() => setShowCoOwnerDropdown(prev => !prev)}>
              {selectedCoOwner ? (
                <span className="text-gray-900 flex items-center gap-2">
                  {selectedCoOwner.firstName || selectedCoOwner.lastName ? `${selectedCoOwner.firstName} ${selectedCoOwner.lastName}`.trim() : selectedCoOwner.email}
                  <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedCoOwner(null); coOwnerManuallyClearedRef.current = true; }} className="text-gray-400 hover:text-red-500 font-bold text-sm">&times;</button>
                </span>
              ) : <span className="text-gray-400">Select Co-Owner</span>}
            </div>
            {showCoOwnerDropdown && (
              <div className="absolute z-10 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                <div className="max-h-48 overflow-y-auto">
                  {coOwnerLoading ? <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading users...</div> : (() => {
                    const currentUserId = board.ownerId || board.owneriD || board.OwnerId || '';
                    const loggedInUserId = useAuthStore.getState().user?.id || '';
                    const filtered = (coOwnerUserList || []).filter((u: any) => u.id !== currentUserId && u.id !== loggedInUserId && (!coOwnerSearch || `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(coOwnerSearch.toLowerCase())));
                    return filtered.length === 0 ? <div className="px-4 py-3 text-sm text-gray-500 text-center">No users found</div> : filtered.map((u: any) => (
                      <button key={u.id} onClick={() => { setSelectedCoOwner({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }); setCoOwnerSearch(''); setShowCoOwnerDropdown(false); }} className="w-full text-left px-4 py-2 hover:bg-brand-green/5 flex items-center gap-2 text-sm border-b last:border-0">
                        <div className="w-7 h-7 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs">{u.firstName?.[0]}</div>
                        <div className="min-w-0"><span className="block font-medium text-gray-900">{u.firstName} {u.lastName}</span>{u.email && <span className="block text-xs text-gray-600 truncate">{u.email}</span>}</div>
                      </button>
                    ));
                  })()}
                </div>
                <div className="p-2 border-t border-gray-100"><input type="text" value={coOwnerSearch} onChange={e => setCoOwnerSearch(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search users..." autoFocus onClick={e => e.stopPropagation()} /></div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-4">
        <button onClick={() => { if (hasChanges) { setShowCancelConfirm(true); } else { onClose(); } }} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">Cancel</button>
        <button onClick={() => name.trim() && country && state && city && updateMutation.mutate()} disabled={!name.trim() || !country || !state || !city || updateMutation.isPending} className="btn-primary text-sm px-6">{updateMutation.isPending ? 'Saving...' : 'Save'}</button>
      </div>
    </div>

    {showCancelConfirm && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
          <div className="flex flex-col items-center text-center">
            <h3 className="text-base font-bold text-gray-800 mb-1">Discard Changes?</h3>
            <p className="text-xs text-gray-500 mb-4">Are you sure you want to cancel? Any unsaved changes will be lost.</p>
            <div className="flex gap-3 w-full">
              <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">No, Keep Editing</button>
              <button onClick={() => { setShowCancelConfirm(false); onClose(); }} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Yes, Discard</button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// -- LIVE TAB CONTENT (fetches from ScoringService API) --
function LiveTabContent({ matchId, scorecard, scorecardLoading }: { matchId: string; scorecard: any; scorecardLoading: boolean }) {
  const { data: liveMatches, isLoading: liveLoading } = useQuery({
    queryKey: ['liveMatches'],
    queryFn: () => scoringService.getLiveMatches().then(r => {
      const d = r.data;
      const items = d?.data ?? d;
      return Array.isArray(items) ? items : items?.$values ?? [];
    }),
    refetchInterval: 15000,
  });

  const matchLiveId = (m: any) => m.id || m.Id || m.scheduleId || m.ScheduleId || m.matchId || m.MatchId || '';
  const isMatchIdMatch = (m: any) => {
    const mid = matchId;
    return m.id === mid || m.Id === mid || m.scheduleId === mid || m.ScheduleId === mid || m.matchId === mid || m.MatchId === mid;
  };
  const isLive = Array.isArray(liveMatches) && liveMatches.some(isMatchIdMatch);

  if (liveLoading || scorecardLoading) {
    return (
      <div className="bg-white border-t p-8 flex justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isLive) {
    return (
      <div className="bg-white border-t p-8 text-center text-gray-500 text-sm">
        <div className="flex flex-col items-center justify-center">
          <span className="text-2xl mb-2">▶</span>
          <h4 className="text-sm font-bold text-gray-800 mb-1">Live Score</h4>
          <p className="text-xs text-gray-500">Live scoring updates will appear here when a match is in progress.</p>
        </div>
      </div>
    );
  }

  // Get the live match data from the scoring API response
  const liveMatch = liveMatches.find(isMatchIdMatch);

  // Use scorecard innings data if available, otherwise fall back to live match data
  const innings = scorecard?.innings ?? liveMatch?.innings ?? [];
  const currentInnings = innings.length > 0 ? innings[innings.length - 1] : null;

  // Extract batting, bowling from current innings
  const battingEntries = currentInnings?.batting ?? currentInnings?.battingEntries ?? [];
  const bowlingEntries = currentInnings?.bowling ?? currentInnings?.bowlingEntries ?? [];
  const battingTeamName = currentInnings?.battingTeamName ?? '';
  const inningsNumber = currentInnings?.inningsNumber ?? 1;
  const ordinal = inningsNumber === 1 ? '1st' : inningsNumber === 2 ? '2nd' : `${inningsNumber}th`;

  // Current batsmen (not out)
  const currentBatsmen = battingEntries.filter((b: any) =>
    !b.dismissalType && b.dismissal !== 'out' && (b.dismissal === 'not out' || b.dismissal === undefined || b.dismissal === '' || b.status === 'Batting')
  );

  // Current partnership
  const partnershipRuns = currentBatsmen.reduce((sum: number, b: any) => sum + (b.runsScored ?? b.runs ?? 0), 0);
  const partnershipBalls = currentBatsmen.reduce((sum: number, b: any) => sum + (b.ballsFaced ?? b.balls ?? 0), 0);

  // Last six balls from live match or scorecard
  const lastSixBalls: string[] = liveMatch?.lastSixBalls
    ? (typeof liveMatch.lastSixBalls === 'string' ? liveMatch.lastSixBalls.split(',') : liveMatch.lastSixBalls)
    : [];

  // Match info
  const tossInfo = scorecard?.tossWonBy
    ? `${scorecard.tossWonBy} won the toss and Elected to ${scorecard.tossDecision ?? 'bat'}`
    : liveMatch?.tossInfo ?? '-';
  const scorerName = liveMatch?.scorerName ?? scorecard?.scorerName ?? '-';
  const playerOfMatch = liveMatch?.playerOfTheMatch ?? scorecard?.playerOfTheMatch ?? 'none';

  return (
    <div className="bg-white border-t">
      {/* BATSMEN Section */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <h4 className="text-sm font-bold text-gray-800">
          BATSMEN - {battingTeamName} ({ordinal} Innings)
        </h4>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left py-2 px-3 font-bold text-gray-700 w-[40%]"></th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">R</th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">B</th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">4s</th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">6s</th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">SR</th>
          </tr>
        </thead>
        <tbody>
          {(currentBatsmen.length > 0 ? currentBatsmen : battingEntries.slice(0, 2)).map((b: any, idx: number) => {
            const runs = b.runsScored ?? b.runs ?? 0;
            const balls = b.ballsFaced ?? b.balls ?? 0;
            const fours = b.fours ?? 0;
            const sixes = b.sixes ?? 0;
            const sr = balls > 0 ? ((runs / balls) * 100).toFixed(2) : '0.00';
            const isStriker = b.isStriker || idx === 0;
            return (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-2.5 px-3 font-medium text-gray-800">
                  {b.batsmanName ?? b.name}{isStriker ? ' *' : ''}
                </td>
                <td className="py-2.5 px-2 text-center font-bold">{runs}</td>
                <td className="py-2.5 px-2 text-center text-gray-600">{balls}</td>
                <td className="py-2.5 px-2 text-center text-gray-600">{fours}</td>
                <td className="py-2.5 px-2 text-center text-gray-600">{sixes}</td>
                <td className="py-2.5 px-2 text-center text-gray-600">{sr}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Current Partnership */}
      <div className="px-4 py-2 border-b text-sm">
        <span className="font-bold text-blue-700">Current Partnership: </span>
        <span className="text-gray-700">{partnershipRuns}({partnershipBalls})</span>
      </div>

      {/* Last Six Balls */}
      {lastSixBalls.length > 0 && (
        <div className="px-4 py-2 border-b text-sm flex items-center gap-2">
          <span className="font-bold text-gray-700">Last Six Balls:</span>
          <div className="flex gap-1.5">
            {lastSixBalls.map((ball: string, idx: number) => {
              const val = ball.trim();
              const isWicket = val.toUpperCase() === 'W';
              return (
                <span
                  key={idx}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                    isWicket
                      ? 'bg-red-500 text-white border-red-600'
                      : 'bg-gray-100 text-gray-800 border-gray-300'
                  }`}
                >
                  {val}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* BOWLER Section */}
      <div className="px-4 py-3 border-b bg-gray-50 mt-2">
        <h4 className="text-sm font-bold text-gray-800">BOWLER</h4>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left py-2 px-3 font-bold text-gray-700 w-[40%]"></th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">O</th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">M</th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">R</th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">W</th>
            <th className="text-center py-2 px-2 font-bold text-gray-700">ECON</th>
          </tr>
        </thead>
        <tbody>
          {bowlingEntries.map((bw: any, idx: number) => {
            const overs = bw.overs ?? 0;
            const maidens = bw.maidens ?? 0;
            const runs = bw.runsConceded ?? bw.runs ?? 0;
            const wickets = bw.wickets ?? 0;
            const econ = overs > 0 ? (runs / overs).toFixed(1) : '0.0';
            return (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-2.5 px-3 font-medium text-gray-800">{bw.bowlerName ?? bw.name}</td>
                <td className="py-2.5 px-2 text-center text-gray-600">{overs}</td>
                <td className="py-2.5 px-2 text-center text-gray-600">{maidens}</td>
                <td className="py-2.5 px-2 text-center text-gray-600">{runs}</td>
                <td className="py-2.5 px-2 text-center font-bold text-red-600">{wickets}</td>
                <td className="py-2.5 px-2 text-center text-gray-600">{econ}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* MATCH INFO */}
      <div className="px-4 py-3 border-t border-b bg-gray-50 mt-2">
        <h4 className="text-sm font-bold text-gray-800">MATCH INFO</h4>
      </div>
      <div className="px-4 py-2 text-sm space-y-2">
        <div className="flex">
          <span className="font-bold text-gray-700 w-40">Toss</span>
          <span className="text-gray-600">{tossInfo}</span>
        </div>
        <div className="flex">
          <span className="font-bold text-gray-700 w-40">Scorer Name</span>
          <span className="text-gray-600">{scorerName}</span>
        </div>
        <div className="flex">
          <span className="font-bold text-gray-700 w-40">Player of The Match</span>
          <span className="text-gray-600">{playerOfMatch}</span>
        </div>
      </div>
    </div>
  );
}

// -- MATCH SCORECARD VIEW (shown when View Score is clicked) --
type ScorecardTab = 'live' | 'scorecard' | 'ball-by-ball';
const SCORECARD_TABS: ScorecardTab[] = ['live', 'scorecard', 'ball-by-ball'];
function MatchScorecardView({ matchId, match, onBack, initialScorecardTab, onScorecardTabChange }: { matchId: string; match: any; onBack: () => void; initialScorecardTab?: ScorecardTab; onScorecardTabChange?: (tab: ScorecardTab) => void }) {
  const { boardId: routeBoardId } = useParams<{ boardId: string }>();
  const [activeTab, setActiveTabState] = useState<ScorecardTab>(initialScorecardTab || 'scorecard');
  const queryClient = useQueryClient();
  const setActiveTab = (tab: ScorecardTab) => {
    setActiveTabState(tab);
    onScorecardTabChange?.(tab);
  };

  // Connect to SignalR hub for real-time scorecard updates
  const [signalRConnected, setSignalRConnected] = useState(false);
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connectSignalR = async (attempt = 0) => {
      if (cancelled) return;
      try {
        await scoringHub.connect();
        if (cancelled) { scoringHub.disconnect(); return; }
        setSignalRConnected(true);
        await scoringHub.joinMatch(matchId);

        // On any scoring event, invalidate queries so they refetch immediately
        const invalidate = () => {
          queryClient.invalidateQueries({ queryKey: ['scorecard', matchId] });
          queryClient.invalidateQueries({ queryKey: ['deliveries', matchId] });
          queryClient.invalidateQueries({ queryKey: ['liveMatches'] });
        };

        scoringHub.onScorecardLoaded(invalidate);
        scoringHub.onScoreUpdate(invalidate);
        scoringHub.onBallUpdate(invalidate);
        scoringHub.onWicketFallen(invalidate);
        scoringHub.onInningsBreak(invalidate);
      } catch (err) {
        console.error('[MatchScorecardView] SignalR connect failed (attempt ' + attempt + '):', err);
        setSignalRConnected(false);
        // Retry with exponential backoff (max 30s), up to 5 attempts
        if (!cancelled && attempt < 5) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
          retryTimeout = setTimeout(() => connectSignalR(attempt + 1), delay);
        }
      }
    };

    connectSignalR();

    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
      scoringHub.removeAllListeners();
      scoringHub.leaveMatch(matchId).catch(() => {});
      scoringHub.disconnect().catch(() => {});
      setSignalRConnected(false);
    };
  }, [matchId, queryClient]);

  // Fetch team boards to resolve board names (show board name instead of roster/playing XI name)
  // Uses the tournament teams dropdown API to map rosterId → boardName
  const scorecardBoardId = routeBoardId || match?.boardId || match?.leagueBoardId || '';
  const scorecardTournamentId = match?.tournamentId || '';
  const { data: scorecardBoardNameMap } = useQuery({
    queryKey: ['rosterBoardNameMap', scorecardBoardId, scorecardTournamentId],
    queryFn: async () => {
      const map: Record<string, string> = {};
      try {
        const r = await leagueService.getTeamsByTournament(scorecardBoardId, scorecardTournamentId);
        const d = r.data as any;
        const inner = d?.data || d;
        const rosters = Array.isArray(inner?.rosters) ? inner.rosters
          : Array.isArray(inner?.rosters?.$values) ? inner.rosters.$values
          : Array.isArray(inner?.Rosters) ? inner.Rosters
          : [];
        const teamsboard = Array.isArray(inner?.teamsboard) ? inner.teamsboard
          : Array.isArray(inner?.teamsBoard) ? inner.teamsBoard
          : Array.isArray(inner?.teams) ? inner.teams
          : [];
        const list = rosters.length > 0 ? rosters : teamsboard.length > 0 ? teamsboard : [];
        list.forEach((t: any) => {
          const id = t.rosterId || t.RosterId || t.id || t.Id || t.teamId || t.teamBoardId || t.boardId || '';
          const boardName = t.boardName || t.BoardName || t.teamBoardName || t.TeamBoardName || '';
          console.log('[ScorecardBoardName] team item:', { id, boardName, rosterName: t.rosterName, raw: JSON.stringify(t).slice(0, 200) });
          if (id && boardName) map[id] = boardName;
        });
      } catch { /* skip */ }
      console.log('[ScorecardBoardName] final map:', map);
      return map;
    },
    enabled: !!scorecardBoardId && !!scorecardTournamentId,
    staleTime: 60000,
  });
  // Also fetch team boards directly as fallback
  const { data: teamBoardsList } = useQuery({
    queryKey: ['teamBoardsForScorecard'],
    queryFn: async () => {
      const res = await boardService.getByType(1, 1, 50);
      const raw = res.data as any;
      const items = raw?.items || (Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.$values) ? raw.$values : []);
      return items.map((b: any) => ({
        id: b.id || b.Id || b.boardId || '',
        name: b.name || b.boardName || b.Name || '',
      }));
    },
    staleTime: 60000,
  });
  const boardNameMap = scorecardBoardNameMap || {};
  const boardsArr = Array.isArray(teamBoardsList) ? teamBoardsList : [];
  const resolveBoardName = (m: any, side: 'home' | 'away') => {
    const teamId = side === 'home' ? (m?.homeTeamId || m?.homeTeamBoardId || m?.HomeTeamId || m?.HomeTeamBoardId) : (m?.awayTeamId || m?.awayTeamBoardId || m?.AwayTeamId || m?.AwayTeamBoardId);
    console.log(`[ResolveBoardName] side=${side}, teamId=${teamId}, boardNameMap keys=`, Object.keys(boardNameMap), 'boardsArr ids=', boardsArr.map((b: any) => b.id), 'match fields:', { homeTeamId: m?.homeTeamId, homeTeamBoardId: m?.homeTeamBoardId, homeTeamName: m?.homeTeamName, awayTeamId: m?.awayTeamId, awayTeamBoardId: m?.awayTeamBoardId, awayTeamName: m?.awayTeamName });
    // First try: rosterId → boardName from tournament teams data
    if (teamId && boardNameMap[teamId]) return boardNameMap[teamId];
    // Second try: check if teamId matches a team board directly
    if (teamId) {
      const board = boardsArr.find((b: any) => b.id === teamId);
      if (board?.name) return board.name;
    }
    // Fallback: use the roster/team name from the match
    return side === 'home' ? (m?.homeTeamName || '') : (m?.awayTeamName || '');
  };

  const isMatchLive = (() => {
    const s = (match?.status ?? '').toLowerCase().replace(/[_\s]/g, '');
    return ['live', 'inprogress', 'started'].includes(s) || signalRConnected;
  })();
  const { data: scorecard, isLoading: scorecardLoading } = useQuery({
    queryKey: ['scorecard', matchId],
    queryFn: () => scoringService.getScorecard(matchId).then(r => {
      const d = r.data;
      const sc = d?.data ?? d;
      // Enrich innings with team names from match/schedule data if scorecard only has IDs
      if (sc?.innings && match) {
        sc.innings.forEach((inn: any) => {
          if (!inn.battingTeamName && inn.battingTeamId) {
            if (inn.battingTeamId === match.homeTeamId) inn.battingTeamName = match.homeTeamName || match.homeTeam;
            else if (inn.battingTeamId === match.awayTeamId) inn.battingTeamName = match.awayTeamName || match.awayTeam;
          }
        });
      }
      return sc;
    }),
    enabled: !!matchId,
    refetchInterval: isMatchLive ? 10000 : 30000,
  });

  // Resolve player IDs from didNotBat to names by fetching user details
  const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const unresolvedIds: string[] = [];
  if (scorecard?.innings) {
    // Collect player IDs already known from batting/bowling
    const knownIds = new Set<string>();
    (scorecard.innings as any[]).forEach((inn: any) => {
      (inn.batsmen ?? inn.batting ?? []).forEach((b: any) => { const id = b.batsmanId ?? b.playerId ?? b.id ?? ''; if (id) knownIds.add(id); });
      (inn.bowlers ?? inn.bowling ?? []).forEach((b: any) => { const id = b.bowlerId ?? b.playerId ?? b.id ?? ''; if (id) knownIds.add(id); });
    });
    (scorecard.innings as any[]).forEach((inn: any) => {
      const dnb = inn.didNotBat ?? inn.yetToBat ?? [];
      if (Array.isArray(dnb)) {
        dnb.forEach((entry: any) => {
          const id = typeof entry === 'string' ? entry.trim() : (entry?.id ?? entry?.playerId ?? entry?.batsmanId ?? '');
          if (id && uuidRe.test(id) && !knownIds.has(id) && !unresolvedIds.includes(id)) unresolvedIds.push(id);
        });
      }
    });
  }
  const { data: resolvedPlayerMap } = useQuery({
    queryKey: ['resolvePlayerNames', ...unresolvedIds],
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(unresolvedIds.map(async (id) => {
        try {
          const res = await userService.getById(id);
          const u = (res.data as any)?.data ?? res.data;
          const name = u?.userName ?? u?.name ?? u?.displayName ?? (`${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim()) ?? '';
          if (name) map[id] = name;
        } catch { /* skip unresolvable */ }
      }));
      return map;
    },
    enabled: unresolvedIds.length > 0,
    staleTime: 300000,
  });

  const tabs: { id: ScorecardTab; label: string; icon: string }[] = [
    { id: 'live', label: 'Live', icon: '▶' },
    { id: 'scorecard', label: 'Scorecard', icon: '📋' },
    { id: 'ball-by-ball', label: 'Ball by Ball', icon: '⊙' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Back button & match header */}
      <div className="mb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-3 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back to Dashboard
        </button>
        <div className="bg-white rounded-lg p-4 border">
          <p className="text-base font-bold text-gray-800">{resolveBoardName(match, 'home')} vs {resolveBoardName(match, 'away')}</p>
          <p className="text-xs text-gray-500 mt-1">{match?.tournamentName} &bull; {formatDateTime(ensureUtc(match?.scheduledAt))}</p>
          {match?.groundName && <p className="text-xs text-gray-400 mt-0.5">📍 {match.groundName}</p>}
          {match?.result && <p className="text-xs text-green-700 font-medium mt-1">{match.result}</p>}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white border-b">
        <div className="flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="mt-0">
        {activeTab === 'live' && (
          <LiveTabContent matchId={matchId} scorecard={scorecard as any} scorecardLoading={scorecardLoading} />
        )}
        {activeTab === 'scorecard' && <ScorecardTabContent scorecard={scorecard as any} loading={scorecardLoading} playerNameMap={resolvedPlayerMap} />}
        {activeTab === 'ball-by-ball' && <BallByBallTabContent scorecard={scorecard as any} matchId={matchId} />}
      </div>
    </div>
  );
}

// -- SCORECARD TAB CONTENT --
function ScorecardTabContent({ scorecard, loading, playerNameMap }: { scorecard: any; loading: boolean; playerNameMap?: Record<string, string> }) {
  // Map API innings data to display format
  const apiInnings: any[] = scorecard?.innings ?? [];
  const mappedInnings = apiInnings.map((inn: any, idx: number) => {
    const batsmen = inn.batsmen ?? inn.batting ?? [];
    const bowlers = inn.bowlers ?? inn.bowling ?? [];
    const inningsNo = inn.inningsNo ?? inn.inningsNumber ?? (idx + 1);
    const battingTeamName = inn.battingTeamName ?? inn.battingTeam ?? inn.teamName ?? `Innings ${inningsNo}`;
    const status = inn.status ?? inn.inningsStatus ?? scorecard?.status ?? '-';

    // Map batsmen
    const batting = batsmen.map((b: any) => {
      const name = b.batsmanName ?? (`${b.firstName ?? ''} ${b.lastName ?? ''}`.trim() || '-');
      const runs = b.runsScored ?? b.runs ?? 0;
      const balls = b.ballsFaced ?? b.balls ?? 0;
      const fours = b.fours ?? 0;
      const sixes = b.sixes ?? 0;
      const sr = balls > 0 ? ((runs / balls) * 100) : 0;
      const dismissal = b.dismissal ?? b.dismissalType ?? b.howOut ?? 'not out';
      return { batsmanName: name, dismissal, runs, balls, fours, sixes, sr };
    });

    // Map bowlers
    const bowling = bowlers.map((bw: any) => {
      const name = bw.bowlerName ?? (`${bw.firstName ?? ''} ${bw.lastName ?? ''}`.trim() || '-');
      const overs = bw.overs ?? 0;
      const maidens = bw.maidens ?? 0;
      const runs = bw.runsConceded ?? bw.runs ?? 0;
      const wickets = bw.wickets ?? 0;
      const econ = bw.econ ?? bw.economy ?? (overs > 0 ? +(runs / overs).toFixed(2) : 0);
      const dots = bw.dots ?? bw.dotBalls ?? 0;
      const fours = bw.fours ?? bw.foursConceded ?? 0;
      const sixes = bw.sixes ?? bw.sixesConceded ?? 0;
      const wides = bw.wides ?? 0;
      const noBalls = bw.noBalls ?? 0;
      return { bowlerName: name, overs, maidens, runs, wickets, econ, dots, fours, sixes, wides, noBalls };
    });

    // Calculate totals from batting data
    const totalRuns = inn.totalRuns ?? inn.total ?? batting.reduce((s: number, b: any) => s + b.runs, 0) + (inn.extras?.total ?? inn.extras ?? 0);
    const totalWickets = inn.totalWickets ?? inn.wickets ?? batting.filter((b: any) => b.dismissal !== 'not out' && b.dismissal !== 'batting' && b.dismissal !== '').length;
    const totalOvers = inn.totalOvers ?? inn.overs ?? (bowlers.length > 0 ? Math.max(...bowlers.map((bw: any) => bw.overs ?? 0)) : 0);
    const extras = typeof inn.extras === 'object' ? inn.extras : { total: inn.extras ?? 0, noBall: inn.noBalls ?? 0, wide: inn.wides ?? 0, legByes: inn.legByes ?? 0, byes: inn.byes ?? 0 };
    const runRate = totalOvers > 0 ? +(totalRuns / totalOvers).toFixed(2) : 0;

    // Fall of wickets
    // Build a player ID → name map from batting entries to resolve IDs in fallOfWickets string
    // Build player ID → name map from batting AND bowling entries across all innings
    const playerIdToName: Record<string, string> = {};
    // Merge in resolved player names from parent (fetched via userService)
    if (playerNameMap) Object.assign(playerIdToName, playerNameMap);
    apiInnings.forEach((allInn: any) => {
      (allInn.batsmen ?? allInn.batting ?? []).forEach((b: any) => {
        const id = b.batsmanId ?? b.playerId ?? b.id ?? '';
        const name = b.batsmanName ?? b.name ?? b.playerName ?? '';
        if (id && name) playerIdToName[id] = name;
      });
      (allInn.bowlers ?? allInn.bowling ?? []).forEach((b: any) => {
        const id = b.bowlerId ?? b.playerId ?? b.id ?? '';
        const name = b.bowlerName ?? b.name ?? b.playerName ?? '';
        if (id && name) playerIdToName[id] = name;
      });
    });
    const resolvePlayerIds = (text: string): string => {
      if (!text) return text;
      // Replace UUIDs with player names
      return text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, (uuid) => playerIdToName[uuid] || uuid);
    };
    let rawFow = inn.fallOfWickets ?? ((inn.fow ?? []).map((f: any) => `${f.score}-${f.wicketNo} (${f.batsmanName ?? f.playerName ?? ''}, ${f.over ?? ''} Ov)`).join(', ') || '-');
    const fallOfWickets = typeof rawFow === 'string' ? resolvePlayerIds(rawFow) : rawFow;

    // Did not bat — resolve player IDs to names
    const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const rawDidNotBat = inn.didNotBat ?? (inn.yetToBat ?? []).map((p: any) => p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()) ?? [];
    const didNotBat = (Array.isArray(rawDidNotBat) ? rawDidNotBat : []).map((entry: any) => {
      if (typeof entry === 'string' && uuidPattern.test(entry.trim())) {
        return playerIdToName[entry.trim()] || entry;
      }
      if (typeof entry === 'string') return resolvePlayerIds(entry);
      // If entry is an object with id/name
      const name = entry?.name ?? entry?.playerName ?? entry?.batsmanName ?? '';
      const id = entry?.id ?? entry?.playerId ?? entry?.batsmanId ?? '';
      if (name && !uuidPattern.test(name)) return name;
      if (id && playerIdToName[id]) return playerIdToName[id];
      return name || id || '';
    }).filter(Boolean);

    return {
      id: inn.id ?? `inn-${idx}`,
      inningsNumber: inningsNo,
      battingTeamName,
      status,
      totalRuns,
      totalWickets,
      totalOvers,
      extras,
      runRate,
      batting,
      fallOfWickets,
      didNotBat,
      bowling,
    };
  });

  const [expandedInnings, setExpandedInnings] = useState<string[]>(mappedInnings.length > 0 ? [mappedInnings[0].id] : []);

  const toggleInnings = (id: string) => {
    setExpandedInnings(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (loading) return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  if (!scorecard || mappedInnings.length === 0) {
    return <div className="bg-white border-t p-6 text-center text-gray-500 text-sm">No scorecard data available for this match.</div>;
  }

  return (
    <div className="bg-white border-t">
      {/* SCORECARD header */}
      <div className="px-4 py-3 border-b">
        <h4 className="text-sm font-bold text-gray-800 uppercase">Scorecard</h4>
      </div>

      <div>
        {mappedInnings.map((inn) => {
          const isExpanded = expandedInnings.includes(inn.id);
          const ordinal = inn.inningsNumber === 1 ? '1st' : inn.inningsNumber === 2 ? '2nd' : `${inn.inningsNumber}th`;
          return (
            <div key={inn.id} className="border-b last:border-b-0">
              {/* Innings header bar */}
              <button
                onClick={() => toggleInnings(inn.id)}
                className="w-full flex justify-between items-center px-4 py-3 bg-gray-700 text-white hover:bg-gray-600 transition-colors"
              >
                <span className="text-sm font-semibold">
                  {inn.battingTeamName} {ordinal} Innings - {inn.status}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">
                    {inn.totalRuns}/{inn.totalWickets} ({inn.totalOvers} Ov)
                  </span>
                  <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 py-4">
                  {/* ── BATSMEN TABLE ── */}
                  <table className="w-full text-sm mb-1">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="text-left py-2.5 px-3 font-bold text-gray-700 w-[30%]">BATSMEN</th>
                        <th className="text-left py-2.5 px-3 font-bold text-gray-700 w-[22%]"></th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700 w-[7%]">R</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700 w-[7%]">B</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700 w-[7%]">4s</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700 w-[7%]">6s</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700 w-[10%]">SR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inn.batting.map((b: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-200 hover:bg-blue-50/30">
                          <td className="py-2.5 px-3 text-blue-700 font-medium">{b.batsmanName}</td>
                          <td className="py-2.5 px-3 text-gray-500 text-sm">{b.dismissal}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-gray-800">{b.runs}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{b.balls}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{b.fours}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{b.sixes}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{(typeof b.sr === 'number' ? b.sr : 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Extras */}
                  <div className="flex justify-between items-center py-2 px-3 border-b border-gray-200 text-sm">
                    <span className="text-gray-600">
                      Extras {inn.extras?.total ?? 0} (NoBall {inn.extras?.noBall ?? 0}, Wide {inn.extras?.wide ?? 0}, LegByes {inn.extras?.legByes ?? 0}, Byes {inn.extras?.byes ?? 0})
                    </span>
                    <span className="font-bold text-gray-800">
                      {inn.totalRuns}/{inn.totalWickets} ({inn.totalOvers} overs RR: {(typeof inn.runRate === 'number' ? inn.runRate : 0).toFixed(2)})
                    </span>
                  </div>

                  {/* Fall of Wickets */}
                  <div className="py-2 px-3 border-b border-gray-200 text-sm">
                    <span className="font-bold text-gray-700">Fall of Wickets : </span>
                    <span className="text-gray-600">{inn.fallOfWickets}</span>
                  </div>

                  {/* Did Not Bat */}
                  {inn.didNotBat.length > 0 && (
                    <div className="py-2 px-3 border-b border-gray-200 text-sm mb-4">
                      <span className="font-bold text-gray-700">Did Not Bat : </span>
                      <span className="text-blue-700">{inn.didNotBat.join(', ')}</span>
                    </div>
                  )}

                  {/* ── BOWLERS TABLE ── */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="text-left py-2.5 px-3 font-bold text-gray-700 w-[22%]">BOWLERS</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">O</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">M</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">R</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">W</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">ECON</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">0s</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">4s</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">6s</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">Wd</th>
                        <th className="text-center py-2.5 px-2 font-bold text-gray-700">NB</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inn.bowling.map((bw: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-200 hover:bg-blue-50/30">
                          <td className="py-2.5 px-3 text-blue-700 font-medium">{bw.bowlerName}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.overs}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.maidens}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.runs}</td>
                          <td className="py-2.5 px-2 text-center font-bold text-gray-800">{bw.wickets}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.econ}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.dots}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.fours}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.sixes}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.wides}</td>
                          <td className="py-2.5 px-2 text-center text-gray-600">{bw.noBalls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- BALL BY BALL TAB CONTENT --
function BallByBallTabContent({ scorecard, matchId }: { scorecard: any; matchId: string }) {
  const apiInnings: any[] = scorecard?.innings ?? [];

  // Build player ID → name lookup from scorecard batsmen/bowlers
  const playerNameMap: Record<string, string> = {};
  apiInnings.forEach((inn: any) => {
    (inn.batsmen ?? inn.batting ?? []).forEach((p: any) => {
      const id = p.playerId ?? p.batsmanId ?? p.id ?? '';
      const name = p.batsmanName ?? (`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '');
      if (id && name) playerNameMap[id] = name;
    });
    (inn.bowlers ?? inn.bowling ?? []).forEach((p: any) => {
      const id = p.playerId ?? p.bowlerId ?? p.id ?? '';
      const name = p.bowlerName ?? (`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '');
      if (id && name) playerNameMap[id] = name;
    });
  });

  const getPlayerName = (id: string | undefined) => (id && playerNameMap[id]) ? playerNameMap[id] : (id?.slice(0, 8) ?? '');

  // Fetch deliveries per innings
  const inningsNumbers = apiInnings.map((inn: any, idx: number) => inn.inningsNo ?? inn.inningsNumber ?? (idx + 1));

  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['deliveries', matchId, inningsNumbers.join(',')],
    queryFn: async () => {
      const results: Record<number, any[]> = {};
      await Promise.all(
        inningsNumbers.map(async (inningsNo: number) => {
          try {
            const res = await scoringService.getDeliveries(matchId, inningsNo, 0, 200);
            const raw = res.data;
            const data = raw?.data ?? raw;
            console.log('[BallByBall] deliveries response for innings', inningsNo, ':', JSON.stringify(data)?.slice(0, 500));
            results[inningsNo] = Array.isArray(data) ? data : (data as any)?.deliveries ?? (data as any)?.$values ?? (data as any)?.items ?? [];
          } catch (err) {
            console.error('[BallByBall] deliveries error for innings', inningsNo, ':', err);
            results[inningsNo] = [];
          }
        })
      );
      return results;
    },
    enabled: !!matchId && inningsNumbers.length > 0,
  });

  // Map innings with their fetched deliveries
  const mappedInnings = apiInnings.map((inn: any, idx: number) => {
    const inningsNo = inn.inningsNo ?? inn.inningsNumber ?? (idx + 1);
    const battingTeamName = inn.battingTeamName ?? inn.battingTeam ?? inn.teamName ?? `Innings ${inningsNo}`;

    // Get deliveries for this innings
    const deliveries: any[] = (deliveriesData?.[inningsNo] ?? [])
      .filter((d: any) => !d.isVoided)
      .sort((a: any, b: any) => (a.seq ?? 0) - (b.seq ?? 0));

    // Calculate totals from deliveries
    const totalRuns = deliveries.reduce((s: number, d: any) => s + (d.totalRuns ?? 0), 0);
    const totalWickets = deliveries.filter((d: any) => d.isWicket).length;
    // Calculate overs: count legal deliveries
    const legalBalls = deliveries.filter((d: any) => d.isLegalDelivery !== false).length;
    const completedOvers = Math.floor(legalBalls / 6);
    const remainingBalls = legalBalls % 6;
    const totalOvers = remainingBalls > 0 ? parseFloat(`${completedOvers}.${remainingBalls}`) : completedOvers;

    // Use scorecard totals if deliveries are empty but scorecard has data
    const finalTotalRuns = deliveries.length > 0 ? totalRuns : (inn.totalRuns ?? inn.total ?? 0);
    const finalTotalWickets = deliveries.length > 0 ? totalWickets : (inn.totalWickets ?? inn.wickets ?? 0);
    const finalTotalOvers = deliveries.length > 0 ? totalOvers : (inn.totalOvers ?? inn.overs ?? 0);

    // Group deliveries by overNo
    const overMap: Record<number, any[]> = {};
    deliveries.forEach((d: any) => {
      const overNum = d.overNo ?? 0;
      if (!overMap[overNum]) overMap[overNum] = [];
      overMap[overNum].push(d);
    });

    // Build over display objects sorted descending
    const overs = Object.entries(overMap)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([overNum, balls]) => {
        const overRuns = balls.reduce((s: number, d: any) => s + (d.totalRuns ?? 0), 0);
        const overWickets = balls.filter((d: any) => d.isWicket).length;

        // Running total: all deliveries up to and including this over
        let runningRuns = 0;
        let runningWickets = 0;
        deliveries.forEach((d: any) => {
          const dOver = d.overNo ?? 0;
          if (dOver <= Number(overNum)) {
            runningRuns += d.totalRuns ?? 0;
            if (d.isWicket) runningWickets++;
          }
        });

        // Map individual balls sorted descending by ballIndexLegal
        const mappedBalls = [...balls]
          .sort((a: any, b: any) => (b.ballIndexLegal ?? b.seq ?? 0) - (a.ballIndexLegal ?? a.seq ?? 0))
          .map((d: any) => {
            const overDisplay = Number(overNum);
            const ballIndex = d.ballIndexLegal ?? 0;
            const ballId = `${overDisplay}.${ballIndex + 1}`;
            const batRuns = d.runsOfBat ?? 0;
            const extras = (d.wideRuns ?? 0) + (d.noBallRuns ?? 0) + (d.byeRuns ?? 0) + (d.legByeRuns ?? 0);
            const runs = d.totalRuns ?? (batRuns + extras);
            const isWicket = !!d.isWicket;
            const label = isWicket ? 'W' : String(runs);

            const bowlerName = getPlayerName(d.bowlerId);
            const batsmanName = getPlayerName(d.strikerId);
            const dismissalKind = d.dismissalKind ?? '';

            let commentary: string;
            if (isWicket) {
              commentary = `${bowlerName} to ${batsmanName}, OUT ${dismissalKind}`;
            } else if (d.wideRuns) {
              commentary = `${bowlerName} to ${batsmanName}, wide, ${runs} run${runs !== 1 ? 's' : ''}`;
            } else if (d.noBallRuns) {
              commentary = `${bowlerName} to ${batsmanName}, no ball, ${runs} run${runs !== 1 ? 's' : ''}`;
            } else {
              commentary = `${bowlerName} to ${batsmanName}, ${runs} run${runs !== 1 ? 's' : ''}`;
            }

            const time = d.createdAt
              ? new Date(ensureUtc(d.createdAt)).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
              : '';

            return { ball: ballId, runs, isWicket, label, commentary, time };
          });

        return { overNumber: Number(overNum) + 1, runs: overRuns, wickets: overWickets, runningTotal: { runs: runningRuns, wickets: runningWickets }, balls: mappedBalls };
      });

    return { id: inn.id ?? `bbb-inn-${idx}`, battingTeamName, inningsNumber: inningsNo, totalRuns: finalTotalRuns, totalWickets: finalTotalWickets, totalOvers: finalTotalOvers, overs };
  });

  const [expandedInnings, setExpandedInnings] = useState<string[]>(mappedInnings.length > 0 ? [mappedInnings[0].id] : []);

  const toggleInnings = (id: string) => {
    setExpandedInnings(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getBallColor = (ball: any): string => {
    if (ball.isWicket) return 'bg-red-500 text-white';
    if (ball.runs === 6) return 'bg-green-500 text-white';
    if (ball.runs === 4) return 'bg-blue-500 text-white';
    if (ball.runs === 0) return 'bg-gray-300 text-gray-700';
    return 'bg-green-500 text-white';
  };

  if (!scorecard || mappedInnings.length === 0) {
    return <div className="bg-white border-t p-6 text-center text-gray-500 text-sm">No ball-by-ball data available for this match.</div>;
  }

  if (deliveriesLoading) {
    return <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="bg-white border-t">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h4 className="text-sm font-bold text-gray-800 uppercase">Ball by Ball</h4>
      </div>

      {/* Innings selector header */}
      {mappedInnings.map((inn) => {
        const isExpanded = expandedInnings.includes(inn.id);
        const ordinal = inn.inningsNumber === 1 ? '1st' : inn.inningsNumber === 2 ? '2nd' : `${inn.inningsNumber}th`;
        return (
          <div key={inn.id}>
            {/* Innings header bar */}
            <button
              onClick={() => toggleInnings(inn.id)}
              className="w-full flex justify-between items-center px-4 py-3 bg-gray-700 text-white hover:bg-gray-600 transition-colors"
            >
              <span className="text-sm font-semibold">
                {inn.battingTeamName} {ordinal} Innings
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">
                  {inn.totalRuns}/{inn.totalWickets} ({inn.totalOvers} Ov)
                </span>
                <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Over-by-over breakdown */}
            {isExpanded && (
              <div className="px-4 py-2">
                {inn.overs.map((over, overIdx) => (
                  <div key={overIdx} className="mb-4 border rounded-lg overflow-hidden">
                    {/* Over header */}
                    <div className="flex justify-between items-start px-4 py-2 bg-gray-50 border-b">
                      <div>
                        <p className="text-sm font-bold text-gray-800">END OF OVER: {over.overNumber}</p>
                        <p className="text-xs text-gray-500">{over.runs} runs | {over.wickets} Wkts</p>
                      </div>
                      <p className="text-sm font-bold text-gray-800">TOTAL: {over.runningTotal.runs}/{over.runningTotal.wickets}</p>
                    </div>

                    {/* Ball rows */}
                    <div className="divide-y divide-gray-100">
                      {over.balls.map((ball, ballIdx) => (
                        <div key={ballIdx} className="flex items-center px-4 py-2.5 hover:bg-gray-50 transition-colors">
                          {/* Ball number */}
                          <span className="text-sm font-medium text-gray-700 w-12 flex-shrink-0">{ball.ball}</span>

                          {/* Run/Wicket badge */}
                          <div className={`${getBallColor(ball)} w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mr-4`}>
                            {ball.label}
                          </div>

                          {/* Commentary */}
                          <p className="text-sm text-gray-700 flex-1 min-w-0">
                            {ball.isWicket ? (
                              <>
                                {ball.commentary.split('OUT')[0]}
                                <span className="font-bold text-red-600">OUT</span>
                                {ball.commentary.split('OUT')[1]}
                              </>
                            ) : (
                              ball.commentary
                            )}
                          </p>

                          {/* Timestamp */}
                          <span className="text-sm font-medium text-gray-500 flex-shrink-0 ml-4">{ball.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -- WAGON WHEEL TAB CONTENT --
function WagonWheelTabContent() {
  return (
    <div className="bg-white border-t p-8">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <span className="text-2xl">🎯</span>
        </div>
        <h4 className="text-sm font-bold text-gray-800 mb-1">Wagon Wheel</h4>
        <p className="text-xs text-gray-500">Wagon wheel visualization will be available once scoring data is recorded.</p>
      </div>
    </div>
  );
}

// -- PITCH MAP TAB CONTENT --
function PitchMapTabContent() {
  return (
    <div className="bg-white border-t p-8">
      <div className="flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <span className="text-2xl">🗺️</span>
        </div>
        <h4 className="text-sm font-bold text-gray-800 mb-1">Pitch Map</h4>
        <p className="text-xs text-gray-500">Pitch map visualization will be available once scoring data is recorded.</p>
      </div>
    </div>
  );
}

// -- SQUAD TAB CONTENT --
function SquadTabContent({ scorecard }: { scorecard: any }) {
  const innings = scorecard?.innings ?? [];

  if (!scorecard || innings.length === 0) {
    return <div className="bg-white border-t p-6 text-center text-gray-500 text-sm">No squad data available for this match.</div>;
  }

  // Collect unique players from batting & bowling entries across all innings
  const teams: Record<string, { name: string; players: { id: string; name: string; role: string }[] }> = {};
  innings.forEach((inn: any) => {
    const teamKey = inn.battingTeamName;
    if (!teams[teamKey]) teams[teamKey] = { name: teamKey, players: [] };
    (inn.batting ?? []).forEach((b: any) => {
      if (!teams[teamKey].players.find(p => p.id === b.batsmanId)) {
        teams[teamKey].players.push({ id: b.batsmanId, name: b.batsmanName, role: 'Batsman' });
      }
    });
    (inn.bowling ?? []).forEach((bw: any) => {
      // Bowlers belong to the other team – find/create that key
      const bowlerTeamKey = Object.keys(teams).find(k => k !== teamKey) || 'Bowling Team';
      if (!teams[bowlerTeamKey]) teams[bowlerTeamKey] = { name: bowlerTeamKey, players: [] };
      if (!teams[bowlerTeamKey].players.find(p => p.id === bw.bowlerId)) {
        teams[bowlerTeamKey].players.push({ id: bw.bowlerId, name: bw.bowlerName, role: 'Bowler' });
      }
    });
  });

  return (
    <div className="bg-white border-t">
      <div className="px-4 py-3 border-b">
        <h4 className="text-sm font-bold text-gray-800 uppercase">Squad</h4>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        {Object.values(teams).map(team => (
          <div key={team.name}>
            <h5 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2">{team.name}</h5>
            <div className="space-y-2">
              {team.players.map((p, idx) => (
                <div key={p.id || idx} className="flex items-center gap-3 py-1.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {p.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.role}</p>
                  </div>
                </div>
              ))}
              {team.players.length === 0 && <p className="text-xs text-gray-400 italic">No players found</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -- LEAGUE LANDING TAB (default when Manage League is opened) --
function LeagueLandingTab({ boardId }: { boardId: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedMatch, setSelectedMatchState] = useState<any>(null);
  const [scorecardTab, setScorecardTab] = useState<ScorecardTab>((searchParams.get('scorecardTab') as ScorecardTab) || 'scorecard');

  const setSelectedMatch = (m: any) => {
    setSelectedMatchState(m);
    if (m) {
      const params = new URLSearchParams(searchParams);
      params.set('matchId', m.id);
      params.set('scorecardTab', scorecardTab);
      setSearchParams(params, { replace: true });
    } else {
      const params = new URLSearchParams(searchParams);
      params.delete('matchId');
      params.delete('scorecardTab');
      setSearchParams(params, { replace: true });
    }
  };

  const handleScorecardTabChange = (tab: ScorecardTab) => {
    setScorecardTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set('scorecardTab', tab);
    setSearchParams(params, { replace: true });
  };

  const { data: tournaments } = useQuery({
    queryKey: ['tournaments', boardId],
    queryFn: () => tournamentService.getByBoard(boardId).then(r => r.data),
  });
  const { data: schedule } = useQuery({
    queryKey: ['schedule-landing', boardId],
    queryFn: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const to = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split('T')[0];
      return leagueService.getSchedule(boardId, from, to).then(r => {
        const d = r.data;
        return (Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? []) as Match[];
      });
    },
    refetchInterval: 30000,
  });

  const allMatches = (schedule ?? []) as any[];
  
  // Fetch live matches from Scoring Service to cross-reference status
  const { data: landingLiveMatches } = useQuery({
    queryKey: ['landingLiveMatches'],
    queryFn: () => scoringService.getLiveMatches().then(r => {
      const d = r.data;
      const items = d?.data ?? d;
      return Array.isArray(items) ? items : items?.$values ?? [];
    }),
    refetchInterval: 15000,
  });
  const liveMatchIds = new Set(
    (Array.isArray(landingLiveMatches) ? landingLiveMatches : []).flatMap((m: any) => [m.id, m.Id, m.scheduleId, m.ScheduleId, m.matchId, m.MatchId].filter(Boolean))
  );
  // Determine effective status: if Scoring Service says it's live, override schedule status
  const getEffectiveStatus = (m: any) => {
    const mid = m.id || m.Id || m.scheduleId || m.ScheduleId || '';
    if (liveMatchIds.has(mid)) return 'Live';
    return m.status || 'Scheduled';
  };

  const recentResults = allMatches.filter((m: any) => {
    const s = getEffectiveStatus(m).toLowerCase().replace(/[_\s]/g, '');
    return s === 'completed' || s === 'complete' || s === 'finished' || s === 'ended';
  });
  const isInProgress = (s: string) => ['Live', 'InProgress', 'In Progress', 'Started'].includes(s);
  const upcomingMatches = allMatches.filter((m: any) => {
    const s = getEffectiveStatus(m);
    const sNorm = s.toLowerCase().replace(/[_\s]/g, '');
    return s === 'Scheduled' || sNorm === 'scheduled' || isInProgress(s);
  });

  // Fetch roster → boardName mapping from tournament teams data
  const landingTournamentIds = Array.from(new Set(allMatches.map((m: any) => m.tournamentId).filter(Boolean))) as string[];
  const { data: landingBoardNameMap } = useQuery({
    queryKey: ['landingBoardNameMap', boardId, landingTournamentIds.join(',')],
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(landingTournamentIds.map(async (tid) => {
        try {
          const r = await leagueService.getTeamsByTournament(boardId, tid);
          const d = r.data as any;
          const inner = d?.data || d;
          const rosters = Array.isArray(inner?.rosters) ? inner.rosters
            : Array.isArray(inner?.rosters?.$values) ? inner.rosters.$values
            : Array.isArray(inner?.Rosters) ? inner.Rosters
            : [];
          const teamsboard = Array.isArray(inner?.teamsboard) ? inner.teamsboard
            : Array.isArray(inner?.teamsBoard) ? inner.teamsBoard
            : Array.isArray(inner?.teams) ? inner.teams
            : [];
          const list = rosters.length > 0 ? rosters : teamsboard.length > 0 ? teamsboard : [];
          list.forEach((t: any) => {
            const id = t.rosterId || t.RosterId || t.id || t.Id || t.teamId || t.teamBoardId || t.boardId || '';
            const bName = t.boardName || t.BoardName || t.teamBoardName || t.TeamBoardName || '';
            if (id && bName) map[id] = bName;
          });
        } catch { /* skip */ }
      }));
      return map;
    },
    enabled: landingTournamentIds.length > 0,
    staleTime: 60000,
  });
  // Also fetch team boards directly as fallback
  const { data: landingBoardsList } = useQuery({
    queryKey: ['teamBoardsForLanding'],
    queryFn: async () => {
      const res = await boardService.getByType(1, 1, 50);
      const raw = res.data as any;
      const items = raw?.items || (Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.$values) ? raw.$values : []);
      return items.map((b: any) => ({
        id: b.id || b.Id || b.boardId || '',
        name: b.name || b.boardName || b.Name || '',
      }));
    },
    staleTime: 60000,
  });
  const landingBoardMap = landingBoardNameMap || {};
  const landingBoards = Array.isArray(landingBoardsList) ? landingBoardsList : [];
  const resolveBoardName = (m: any, side: 'home' | 'away') => {
    const teamId = side === 'home' ? (m?.homeTeamId || m?.homeTeamBoardId || m?.HomeTeamId || m?.HomeTeamBoardId) : (m?.awayTeamId || m?.awayTeamBoardId || m?.AwayTeamId || m?.AwayTeamBoardId);
    // First try: rosterId → boardName from tournament teams data
    if (teamId && landingBoardMap[teamId]) return landingBoardMap[teamId];
    // Second try: check if teamId matches a team board directly
    if (teamId) {
      const board = landingBoards.find((b: any) => b.id === teamId);
      if (board?.name) return board.name;
    }
    // Fallback: use the roster/team name from the match
    return side === 'home' ? (m?.homeTeamName || '') : (m?.awayTeamName || '');
  };

  // Auto-select match from URL on initial load
  const urlMatchId = searchParams.get('matchId');
  useEffect(() => {
    if (urlMatchId && !selectedMatch && allMatches.length > 0) {
      const found = allMatches.find((m: any) => m.id === urlMatchId);
      if (found) setSelectedMatchState(found);
    }
  }, [urlMatchId, allMatches]);

  // If a match is selected, show the scorecard view
  if (selectedMatch) {
    return <MatchScorecardView matchId={selectedMatch.id} match={selectedMatch} onBack={() => setSelectedMatch(null)} initialScorecardTab={scorecardTab} onScorecardTabChange={handleScorecardTabChange} />;
  }

  return (
    <div className="animate-fade-in space-y-6">
      {/* Star Batsmen of the Week */}
      

      {/* Star Bowlers of the Week */}
     

      {/* Recent Match Results */}
      <div>
        <h3 className="text-sm font-bold text-gray-800 uppercase border-b-2 border-yellow-400 pb-2 mb-3">
          Recent Match Results
        </h3>
        {recentResults.length > 0 ? (
          <div className="space-y-3">
            {recentResults.map((m: any) => (
              <div key={m.id} className="bg-white rounded-lg p-4 border flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                  {m.homeTeamLogo && <img src={m.homeTeamLogo} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{resolveBoardName(m, 'home')} vs {resolveBoardName(m, 'away')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setSelectedMatch(m)} className="px-4 py-1.5 bg-brand-bg text-white rounded text-xs font-semibold hover:bg-brand-dark transition-colors whitespace-nowrap">View Score</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-red-500 text-sm italic">No completed match results</p>
        )}
      </div>

      {/* Upcoming / In Progress Matches */}
      <div>
        <h3 className="text-sm font-bold text-gray-800 uppercase border-b-2 border-yellow-400 pb-2 mb-3">
          Upcoming/In Progress Matches
        </h3>
        {upcomingMatches.length > 0 ? (
          <div className="space-y-3">
            {upcomingMatches.map((m: any) => {
              const live = isInProgress(getEffectiveStatus(m));
              return (
                <div key={m.id} className="bg-white rounded-lg p-4 border flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{resolveBoardName(m, 'home')} vs {resolveBoardName(m, 'away')}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {live ? (
                      <button onClick={() => setSelectedMatch(m)} className="px-4 py-1.5 bg-brand-bg text-white rounded text-xs font-semibold hover:bg-brand-dark transition-colors whitespace-nowrap">Live Score</button>
                    ) : (
                      <button disabled className="px-4 py-1.5 bg-gray-300 text-gray-500 rounded text-xs font-semibold cursor-not-allowed whitespace-nowrap">View Score</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-red-500 text-sm italic">No upcoming matches</p>
        )}
      </div>
    </div>
  );
}

// -- CREATE UMPIRE TAB --
function CreateUmpireTab({ boardId, onClose }: { boardId: string; onClose?: () => void }) {
  const [name, setName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [contactNo, setContactNo] = useState('');
  const [email, setEmail] = useState('');
  const [emailAutoFilled, setEmailAutoFilled] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const qc = useQueryClient();

  // User list for umpire name dropdown
  const [umpireNameDropdownOpen, setUmpireNameDropdownOpen] = useState(false);
  const [umpireNameSearch, setUmpireNameSearch] = useState('');
  const { data: umpireUserList, isLoading: umpireUsersLoading } = useQuery({
    queryKey: ['usersList'],
    queryFn: async () => {
      const r = await userService.list();
      const raw = r.data as any;
      return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.users) ? raw.users : [];
    },
  });

  // Fetch existing umpires for duplicate name check
  const { data: existingUmpires } = useQuery({
    queryKey: ['umpires', boardId],
    queryFn: async () => {
      const r = await leagueService.getUmpires(boardId);
      const d = r.data;
      return (Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? []) as any[];
    },
    enabled: !!boardId,
    staleTime: 0,
  });

  // Phone codes state
  const [phoneCodeList, setPhoneCodeList] = useState<{ name: string; code: string; dial_code: string; flag?: string }[]>([]);
  const [phoneCodesLoading, setPhoneCodesLoading] = useState(false);
  const [phoneCodeDropdownOpen, setPhoneCodeDropdownOpen] = useState(false);
  const [phoneCodeSearchText, setPhoneCodeSearchText] = useState('');

  // Location cascading dropdown state
  const [countryList, setCountryList] = useState<string[]>([]);
  const [stateList, setStateList] = useState<string[]>([]);
  const [cityList, setCityList] = useState<string[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [countrySearchText, setCountrySearchText] = useState('');
  const [stateSearchText, setStateSearchText] = useState('');
  const [citySearchText, setCitySearchText] = useState('');

  useEffect(() => {
    setCountriesLoading(true);
    fetchCountries().then(setCountryList).catch(() => setCountryList([])).finally(() => setCountriesLoading(false));
    setPhoneCodesLoading(true);
    fetchCountryPhoneCodes().then(setPhoneCodeList).catch(() => setPhoneCodeList([])).finally(() => setPhoneCodesLoading(false));
  }, []);

  useEffect(() => {
    if (!country) { setStateList([]); setCityList([]); return; }
    setStatesLoading(true);
    fetchStates(country).then(setStateList).catch(() => setStateList([])).finally(() => setStatesLoading(false));
    const max = country === 'United States' ? 5 : 6;
    setZipCode(prev => prev.slice(0, max));
  }, [country]);

  useEffect(() => {
    if (!country || !state) { setCityList([]); return; }
    setCitiesLoading(true);
    fetchCities(country, state).then(setCityList).catch(() => setCityList([])).finally(() => setCitiesLoading(false));
  }, [country, state]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Umpire Name is required';
    else if ((existingUmpires || []).some((u: any) => (u.umpireName || u.name || '').trim().toLowerCase() === name.trim().toLowerCase())) newErrors.name = 'Umpire name is already used, please select a different name';
    if (!city.trim()) newErrors.city = 'City is required';
    if (!state.trim()) newErrors.state = 'State is required';
    if (!country.trim()) newErrors.country = 'Country is required';
    if (!zipCode.trim()) {
      newErrors.zipCode = 'Zip Code is required';
    } else if (country === 'United States' && !/^\d{5}$/.test(zipCode.trim())) {
      newErrors.zipCode = 'Zip Code must be exactly 5 digits';
    } else if (country !== 'United States' && !/^\d{6}$/.test(zipCode.trim())) {
      newErrors.zipCode = 'Zip Code must be exactly 6 digits';
    }
    if (!email.trim()) {
      newErrors.email = 'E-mail ID is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,3}$/.test(email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const createMutation = useMutation({
    mutationFn: () => leagueService.createUmpire(boardId, {
      umpireName: name.trim(),
      address1: addressLine1.trim(),
      address2: addressLine2.trim(),
      city: city.trim(),
      state: state.trim(),
      country: country.trim(),
      zipcode: zipCode.trim(),
      homePhone: '',
      workPhone: '',
      mobile: contactNo.trim(),
      countryCode: contactNo.trim() ? countryCode : '',
      email: email.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umpires', boardId] });
      setName(''); setAddressLine1(''); setAddressLine2('');
      setCity(''); setState(''); setCountry('');
      setZipCode(''); setContactNo(''); setEmail(''); setEmailAutoFilled(false);
      setErrors({});
      setSubmitStatus({ type: 'success', message: 'Umpire created successfully!' });
      if (onClose) onClose();
    },
    onError: (err: any) => {
      const detail = err?.response?.data;
      const msg = detail?.message || detail?.title || detail?.errors?.[Object.keys(detail?.errors || {})[0]]?.[0] || (err?.response?.status === 500 ? 'Server error. Please check your inputs and try again.' : err?.message) || 'Failed to create umpire. Please try again.';
      setSubmitStatus({ type: 'error', message: msg });
    },
  });

  const handleSubmit = () => {
    setSubmitStatus(null);
    if (!validate()) return;
    createMutation.mutate();
  };

  const hasAnyData = () => name.trim() || addressLine1.trim() || addressLine2.trim() || city.trim() || state.trim() || country.trim() || zipCode.trim() || contactNo.trim() || email.trim();

  const handleCancel = () => {
    if (hasAnyData()) { setShowCancelConfirm(true); return; }
    if (onClose) onClose();
  };

  const confirmCancel = () => {
    setShowCancelConfirm(false);
    setName(''); setAddressLine1(''); setAddressLine2('');
    setCity(''); setState(''); setCountry('');
    setZipCode(''); setContactNo(''); setEmail(''); setEmailAutoFilled(false);
    setErrors({});
    setSubmitStatus(null);
    if (onClose) onClose();
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-lg shadow-sm">
        <div className="bg-gray-100 px-6 py-3 border-b">
          <h2 className="text-base font-bold text-gray-800">Create Umpire</h2>
        </div>
        <div className="p-6">
          {/* Status message */}
          {submitStatus && (
            <div className={`mb-4 px-4 py-3 rounded text-sm font-medium ${submitStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {submitStatus.message}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            {/* Row 1 */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Umpire Name <span className="text-red-500">*</span>
              </label>
              {umpireNameDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => setUmpireNameDropdownOpen(false)} />}
              <input
                value={name}
                onChange={e => {
                  const val = sanitizeTextInput(e.target.value);
                  setName(val);
                  setUmpireNameSearch(val);
                  setUmpireNameDropdownOpen(true);
                  setEmailAutoFilled(false);
                  setEmail('');
                  const trimmed = val.trim().toLowerCase();
                  const umpList = existingUmpires || [];
                  console.log('[DupCheck] existingUmpires count:', umpList.length, 'checking:', trimmed, 'names:', umpList.map((u: any) => u.umpireName || u.name || u.UmpireName || u.Name));
                  const isDup = trimmed && umpList.some((u: any) => {
                    const existing = (u.umpireName || u.name || u.UmpireName || u.Name || '').trim().toLowerCase();
                    return existing === trimmed;
                  });
                  if (isDup) {
                    setErrors(prev => ({ ...prev, name: 'Umpire name is already used, please select a different name' }));
                  } else {
                    setErrors(prev => ({ ...prev, name: '' }));
                  }
                }}
                onFocus={() => setUmpireNameDropdownOpen(true)}
                placeholder=""
                className={`input-field ${errors.name ? 'border-red-500' : ''}`}
                autoComplete="off"
              />
              {umpireNameDropdownOpen && name.trim().length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="max-h-48 overflow-y-auto">
                    {umpireUsersLoading ? (
                      <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading users...</div>
                    ) : (() => {
                      const filtered = (umpireUserList || []).filter((u: any) =>
                        `${u.firstName || ''} ${u.lastName || ''} ${u.email || ''} ${u.userName || ''}`.toLowerCase().includes(name.trim().toLowerCase())
                      );
                      return filtered.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">No matching users ? name will be submitted as entered</div>
                      ) : (
                        filtered.map((u: any) => {
                          const displayName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.userName || (u.email ? u.email.split('@')[0] : u.id);
                          const initial = (u.firstName?.[0] || u.userName?.[0] || '?').toUpperCase();
                          return (
                            <button
                              key={u.id}
                              onClick={() => {
                                setName(displayName);
                                setEmail(u.email || '');
                                setEmailAutoFilled(!!(u.email));
                                setUmpireNameDropdownOpen(false);
                                setUmpireNameSearch('');
                                const trimmed = displayName.trim().toLowerCase();
                                const isDup = trimmed && (existingUmpires || []).some((ump: any) => {
                                  const existing = (ump.umpireName || ump.name || ump.UmpireName || ump.Name || '').trim().toLowerCase();
                                  return existing === trimmed;
                                });
                                if (isDup) {
                                  setErrors(prev => ({ ...prev, name: 'Umpire name is already used, please select a different name' }));
                                } else {
                                  setErrors(prev => ({ ...prev, name: '' }));
                                }
                                if (errors.email) setErrors(prev => ({ ...prev, email: '' }));
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-brand-green/5 flex items-center gap-2 text-sm border-b last:border-0"
                            >
                              <div className="w-7 h-7 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs">
                                {initial}
                              </div>
                              <div className="min-w-0">
                                <span className="block font-medium text-gray-900">{displayName}</span>
                                {u.email && <span className="block text-xs text-gray-600 truncate">{u.email}</span>}
                              </div>
                            </button>
                          );
                        })
                      );
                    })()}
                  </div>
                </div>
              )}
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
              <input
                value={addressLine1}
                onChange={e => setAddressLine1(sanitizeTextInput(e.target.value))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
              <input
                value={addressLine2}
                onChange={e => setAddressLine2(sanitizeTextInput(e.target.value))}
                className="input-field"
              />
            </div>

            {/* Row 2: Country ? State ? City cascading dropdowns */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country <span className="text-red-500">*</span>
              </label>
              {countryDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCountryDropdownOpen(false); setCountrySearchText(''); }} />}
              <div
                className={`input-field cursor-pointer flex items-center justify-between border-gray-400 ${countriesLoading ? 'bg-gray-50' : ''} ${errors.country ? 'border-red-500' : ''}`}
                onClick={() => { if (!countriesLoading) setCountryDropdownOpen(!countryDropdownOpen); if (errors.country) setErrors(prev => ({ ...prev, country: '' })); }}
              >
                <span className={country ? 'text-gray-900' : 'text-gray-400'}>{countriesLoading ? 'Loading countries...' : country || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${countryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {countryDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={countrySearchText} onChange={e => setCountrySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search country..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).map(c => (
                      <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${country === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setCountry(c); setState(''); setCity(''); setCountryDropdownOpen(false); setCountrySearchText(''); }}>{c}</button>
                    ))}
                    {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
              {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country}</p>}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State <span className="text-red-500">*</span>
              </label>
              {stateDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setStateDropdownOpen(false); setStateSearchText(''); }} />}
              <div
                className={`input-field flex items-center justify-between border-gray-400 ${!country || statesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'} ${errors.state ? 'border-red-500' : ''}`}
                onClick={() => { if (country && !statesLoading) setStateDropdownOpen(!stateDropdownOpen); if (errors.state) setErrors(prev => ({ ...prev, state: '' })); }}
              >
                <span className={state ? 'text-gray-900' : 'text-gray-400'}>{!country ? '' : statesLoading ? 'Loading states...' : state || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${stateDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {stateDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={stateSearchText} onChange={e => setStateSearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search state..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).map(s => (
                      <button key={s} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${state === s ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setState(s); setCity(''); setStateDropdownOpen(false); setStateSearchText(''); }}>{s}</button>
                    ))}
                    {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
              {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City <span className="text-red-500">*</span>
              </label>
              {cityDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCityDropdownOpen(false); setCitySearchText(''); }} />}
              <div
                className={`input-field flex items-center justify-between border-gray-400 ${!state || citiesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'} ${errors.city ? 'border-red-500' : ''}`}
                onClick={() => { if (state && !citiesLoading) setCityDropdownOpen(!cityDropdownOpen); if (errors.city) setErrors(prev => ({ ...prev, city: '' })); }}
              >
                <span className={city ? 'text-gray-900' : 'text-gray-400'}>{!state ? '' : citiesLoading ? 'Loading...' : city || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${cityDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {cityDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={citySearchText} onChange={e => setCitySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search city..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).map(c => (
                      <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${city === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setCity(c); setCityDropdownOpen(false); setCitySearchText(''); }}>{c}</button>
                    ))}
                    {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
              {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
            </div>

            {/* Row 3 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Zip Code <span className="text-red-500">*</span>
              </label>
              <input
                value={zipCode}
                maxLength={country === 'United States' ? 5 : 6}
                onChange={e => { const max = country === 'United States' ? 5 : 6; const v = e.target.value.replace(/\D/g, '').slice(0, max); setZipCode(v); if (errors.zipCode) setErrors(prev => ({ ...prev, zipCode: '' })); }}
                className={`input-field ${errors.zipCode ? 'border-red-500' : ''}`}
              />
              {errors.zipCode && <p className="text-red-500 text-xs mt-1">{errors.zipCode}</p>}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
              <div className="flex w-full border border-gray-400 rounded-lg h-[42px] bg-white focus-within:ring-2 focus-within:ring-brand-green focus-within:border-transparent transition-all duration-200">
                <div className="relative flex-shrink-0">
                  {phoneCodeDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setPhoneCodeDropdownOpen(false); setPhoneCodeSearchText(''); }} />}
                  <div
                    className="h-full px-2 text-sm cursor-pointer flex items-center gap-1 border-r border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors rounded-l-lg"
                    onClick={() => { if (!phoneCodesLoading) setPhoneCodeDropdownOpen(!phoneCodeDropdownOpen); }}
                  >
                    <img src={countryCode === '+91' ? '/images/flag-in.svg' : '/images/flag-us.svg'} alt="" className="w-4 h-3 object-cover rounded-sm" />
                    <span className="text-gray-900 text-xs">{phoneCodesLoading ? '...' : (() => { const sel = phoneCodeList.find(c => c.dial_code === countryCode); return sel ? `${sel.dial_code}` : `${countryCode}`; })()}</span>
                    <svg className={`w-3 h-3 text-gray-400 transition-transform ${phoneCodeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {phoneCodeDropdownOpen && (
                    <div className="absolute z-10 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg">
                      <div className="p-2 border-b border-gray-100">
                        <input type="text" value={phoneCodeSearchText} onChange={e => setPhoneCodeSearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search code" autoFocus onClick={e => e.stopPropagation()} />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {(phoneCodeList.length > 0 ? phoneCodeList : [{ name: 'India', code: 'IN', dial_code: '+91', flag: '' }, { name: 'United States', code: 'US', dial_code: '+1', flag: '' }])
                          .filter(c => !phoneCodeSearchText || c.dial_code.includes(phoneCodeSearchText) || c.code.toLowerCase().includes(phoneCodeSearchText.toLowerCase()) || c.name.toLowerCase().includes(phoneCodeSearchText.toLowerCase()))
                          .map(c => (
                          <button key={`${c.code}-${c.dial_code}`} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 flex items-center gap-2 ${countryCode === c.dial_code ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                            onClick={() => { setCountryCode(c.dial_code); setContactNo(prev => prev.slice(0, c.dial_code === '+1' ? 9 : 10)); setPhoneCodeDropdownOpen(false); setPhoneCodeSearchText(''); }}>
                            <img src={c.code === 'IN' ? '/images/flag-in.svg' : '/images/flag-us.svg'} alt="" className="w-5 h-3.5 object-cover rounded-sm" />
                            {c.dial_code} ({c.code})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <input
                  value={(() => { const d = contactNo; if (countryCode === '+1' && d.length > 0) { const a = d.slice(0,3), b = d.slice(3,6), c = d.slice(6); return d.length <= 3 ? `(${a}` : d.length <= 6 ? `(${a}) ${b}` : `(${a}) ${b}-${c}`; } if (countryCode === '+91' && d.length > 0) { return d.length <= 5 ? d.slice(0,5) : `${d.slice(0,5)} ${d.slice(5)}`; } return d; })()}
                  maxLength={countryCode === '+1' ? 14 : 11}
                  onChange={e => { const max = 10; const v = e.target.value.replace(/\D/g, '').slice(0, max); setContactNo(v); }}
                  className="flex-1 min-w-0 px-3 h-full text-sm bg-transparent outline-none rounded-r-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email ID <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                readOnly={emailAutoFilled}
                onChange={e => { if (!emailAutoFilled) { setEmail(e.target.value); if (errors.email) setErrors(prev => ({ ...prev, email: '' })); } }}
                className={`input-field ${errors.email ? 'border-red-500' : ''} ${emailAutoFilled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={handleCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !name.trim() || !city.trim() || !state.trim() || !country.trim() || !zipCode.trim() || !email.trim() || !!errors.name}
              className="btn-primary px-8 py-2 text-sm"
            >
              {createMutation.isPending ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Discard Changes?</h3>
              <p className="text-xs text-gray-500 mb-4">You have unsaved changes. Are you sure you want to discard them?</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">No, Keep Editing</button>
                <button onClick={confirmCancel} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Yes, Discard</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- UMPIRE LIST TAB --
function UmpireListTab({ boardId, onDirtyChange }: { boardId: string; onDirtyChange?: (dirty: boolean) => void }) {
  const qc = useQueryClient();
  const [showCreate, _setShowCreateUmpire] = useState(() => sessionStorage.getItem('umpire_mode') === 'create');
  const setShowCreate = (v: boolean) => { _setShowCreateUmpire(v); if (v) sessionStorage.setItem('umpire_mode', 'create'); else sessionStorage.removeItem('umpire_mode'); };
  const [editId, _setEditId] = useState<string | null>(() => sessionStorage.getItem('umpireEditId') || null);
  const setEditId = (id: string | null) => { _setEditId(id); if (id) sessionStorage.setItem('umpireEditId', id); else sessionStorage.removeItem('umpireEditId'); };
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress1, setEditAddress1] = useState('');
  const [editAddress2, setEditAddress2] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editZipcode, setEditZipcode] = useState('');
  const [editHomePhone, setEditHomePhone] = useState('');
  const [editWorkPhone, setEditWorkPhone] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [editOriginal, setEditOriginal] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Location cascading dropdown state for edit form
  const [countryList, setCountryList] = useState<string[]>([]);
  const [stateList, setStateList] = useState<string[]>([]);
  const [cityList, setCityList] = useState<string[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [countrySearchText, setCountrySearchText] = useState('');
  const [stateSearchText, setStateSearchText] = useState('');
  const [citySearchText, setCitySearchText] = useState('');

  // Phone codes state for edit
  const [editPhoneCodeList, setEditPhoneCodeList] = useState<{ name: string; code: string; dial_code: string; flag?: string }[]>([]);
  const [editPhoneCodesLoading, setEditPhoneCodesLoading] = useState(false);
  const [editCountryCode, setEditCountryCode] = useState('+1');
  const [editPhoneCodeDropdownOpen, setEditPhoneCodeDropdownOpen] = useState(false);
  const [editPhoneCodeSearchText, setEditPhoneCodeSearchText] = useState('');

  useEffect(() => {
    setCountriesLoading(true);
    fetchCountries().then(setCountryList).catch(() => setCountryList([])).finally(() => setCountriesLoading(false));
    setEditPhoneCodesLoading(true);
    fetchCountryPhoneCodes().then(setEditPhoneCodeList).catch(() => setEditPhoneCodeList([])).finally(() => setEditPhoneCodesLoading(false));
  }, []);

  useEffect(() => {
    if (!editCountry) { setStateList([]); setCityList([]); return; }
    setStatesLoading(true);
    fetchStates(editCountry).then(setStateList).catch(() => setStateList([])).finally(() => setStatesLoading(false));
    const max = editCountry === 'United States' ? 5 : 6;
    setEditZipcode(prev => prev.slice(0, max));
  }, [editCountry]);

  useEffect(() => {
    if (!editCountry || !editState) { setCityList([]); return; }
    setCitiesLoading(true);
    fetchCities(editCountry, editState).then(setCityList).catch(() => setCityList([])).finally(() => setCitiesLoading(false));
  }, [editCountry, editState]);

  useEffect(() => { onDirtyChange?.(showCreate || !!editId); }, [showCreate, editId]);

  const { data: umpires, isLoading } = useQuery({
    queryKey: ['umpires', boardId],
    queryFn: () => leagueService.getUmpires(boardId).then(r => {
      const d = r.data;
      const list = (Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? []) as Umpire[];
      // Apply any pending umpire edits from sessionStorage (covers backend not persisting countryCode)
      let edits: Record<string, any> = {};
      try { edits = JSON.parse(sessionStorage.getItem('umpireEdits') || '{}'); } catch {}
      return list.map((u: any) => {
        const uid = u.id || u.umpireId;
        const overlay = edits[uid];
        return overlay ? { ...u, ...overlay } : u;
      });
    }),
    enabled: !!boardId,
  });
  const umpireList = (Array.isArray(umpires) ? umpires : []).slice().sort((a: any, b: any) => {
    const nameA = (a.umpireName || a.name || '').toLowerCase();
    const nameB = (b.umpireName || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const formatPhone = (u: any): string => {
    const raw = u.mobile || u.contactNumber || '';
    if (!raw) return '-';
    const cc = u.countryCode || '';
    let digits = raw.replace(/\D/g, '');
    // Strip country code prefix from digits
    const ccDigits = cc.replace(/\D/g, '');
    if (ccDigits && digits.startsWith(ccDigits)) {
      digits = digits.slice(ccDigits.length);
    }
    // Detect effective country code from stored countryCode, umpire country, or raw number
    const country = (u.country || '').toLowerCase();
    let effectiveCC = cc;
    if (!effectiveCC) {
      if (digits.startsWith('91') && digits.length === 12) { effectiveCC = '+91'; digits = digits.slice(2); }
      else if (digits.startsWith('1') && digits.length === 11) { effectiveCC = '+1'; digits = digits.slice(1); }
      else if (country === 'india') { effectiveCC = '+91'; }
      else if (country === 'united states' || country === 'us' || country === 'usa') { effectiveCC = '+1'; }
    }
    // India format: +91 XXXXX XXXXX
    if (effectiveCC === '+91' && digits.length === 10) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    // US format: +1 XXX XXX XXXX
    if (effectiveCC === '+1' && digits.length === 10) {
      return `+1 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    }
    // Generic: show country code + digits
    return effectiveCC ? `${effectiveCC} ${digits}` : digits || '-';
  };

  const deleteMutation = useMutation({
    mutationFn: (id: string) => leagueService.deleteUmpire(boardId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['umpires', boardId] }),
  });

  const updateMutation = useMutation({
    mutationFn: () => leagueService.updateUmpire(boardId, editId!, {
      id: editId!,
      umpireName: editName,
      address1: editAddress1,
      address2: editAddress2,
      city: editCity,
      state: editState,
      country: editCountry,
      zipcode: editZipcode,
      homePhone: editHomePhone,
      workPhone: editWorkPhone,
      mobile: editMobile.trim(),
      countryCode: editMobile.trim() ? editCountryCode : '',
      email: editEmail,
    }),
    onSuccess: () => {
      // Cancel any in-flight refetches so they don't overwrite our optimistic update
      qc.cancelQueries({ queryKey: ['umpires', boardId] });

      // Persist the edit overlay in sessionStorage so it survives refetch/reload
      const editOverlay = {
        umpireName: editName,
        address1: editAddress1,
        address2: editAddress2,
        city: editCity,
        state: editState,
        country: editCountry,
        zipcode: editZipcode,
        homePhone: editHomePhone,
        workPhone: editWorkPhone,
        mobile: editMobile.trim(),
        countryCode: editMobile.trim() ? editCountryCode : '',
        email: editEmail,
      };
      try {
        const pending = JSON.parse(sessionStorage.getItem('umpireEdits') || '{}');
        pending[editId!] = editOverlay;
        sessionStorage.setItem('umpireEdits', JSON.stringify(pending));
      } catch {}

      // Optimistically update the umpire in the cache so country code + mobile show immediately
      qc.setQueryData(['umpires', boardId], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((u: any) => {
          const uid = u.id || u.umpireId;
          if (uid !== editId) return u;
          return { ...u, ...editOverlay };
        });
      });
      // Delay the refetch so the backend has time to persist the change
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['umpires', boardId] });
      }, 3000);
      setEditId(null);
      setUpdateError('');
      setUpdateSuccess('Umpire updated successfully!');
      setTimeout(() => setUpdateSuccess(''), 4000);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.response?.data?.title || error?.message || 'Failed to update umpire.';
      setUpdateError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    },
  });

  const populateEditFields = (u: any) => {
    setEditName(u.umpireName || u.name || u.userName || u.fullName || '');
    setEditAddress1(u.address1 || u.addressLine1 || '');
    setEditAddress2(u.address2 || u.addressLine2 || '');
    setEditCity(u.city || '');
    setEditState(u.state || '');
    setEditCountry(u.country || '');
    setEditZipcode(u.zipcode || u.zipCode || '');
    setEditHomePhone(u.homePhone || '');
    setEditWorkPhone(u.workPhone || '');
    const rawMobile = u.mobile || u.contactNumber || '';
    const apiCC = u.countryCode || '';
    const umpireCountry = (u.country || '').toLowerCase();
    if (apiCC) {
      setEditCountryCode(apiCC);
      const digits = rawMobile.startsWith(apiCC) ? rawMobile.slice(apiCC.length) : rawMobile;
      setEditMobile(digits.replace(/\D/g, ''));
    } else if (rawMobile) {
      const digits = rawMobile.replace(/\D/g, '');
      // Try to detect country code from raw number
      if (digits.startsWith('91') && digits.length === 12) { setEditCountryCode('+91'); setEditMobile(digits.slice(2)); }
      else if (digits.startsWith('1') && digits.length === 11) { setEditCountryCode('+1'); setEditMobile(digits.slice(1)); }
      // Use umpire's country field as fallback
      else if (umpireCountry === 'india') { setEditCountryCode('+91'); setEditMobile(digits); }
      else if (umpireCountry === 'united states' || umpireCountry === 'us' || umpireCountry === 'usa') { setEditCountryCode('+1'); setEditMobile(digits); }
      else {
        const knownCodes = ['+91', '+1'];
        const matched = knownCodes.find(code => rawMobile.startsWith(code));
        if (matched) { setEditCountryCode(matched); setEditMobile(rawMobile.slice(matched.length).replace(/\D/g, '')); }
        else { setEditCountryCode('+1'); setEditMobile(digits); }
      }
    } else {
      // Default based on umpire country
      if (umpireCountry === 'india') setEditCountryCode('+91');
      else setEditCountryCode('+1');
      setEditMobile('');
    }
    setEditEmail(u.email || '');
    // Compute parsed values for editOriginal ? must match the logic above
    let parsedCode = '+1';
    let parsedMobile = '';
    const origDigits = rawMobile.replace(/\D/g, '');
    if (apiCC) {
      parsedCode = apiCC;
      parsedMobile = (rawMobile.startsWith(apiCC) ? rawMobile.slice(apiCC.length) : rawMobile).replace(/\D/g, '');
    } else if (rawMobile) {
      if (origDigits.startsWith('91') && origDigits.length === 12) { parsedCode = '+91'; parsedMobile = origDigits.slice(2); }
      else if (origDigits.startsWith('1') && origDigits.length === 11) { parsedCode = '+1'; parsedMobile = origDigits.slice(1); }
      else if (umpireCountry === 'india') { parsedCode = '+91'; parsedMobile = origDigits; }
      else if (umpireCountry === 'united states' || umpireCountry === 'us' || umpireCountry === 'usa') { parsedCode = '+1'; parsedMobile = origDigits; }
      else { const m = ['+91', '+1'].find(c => rawMobile.startsWith(c)); if (m) { parsedCode = m; parsedMobile = rawMobile.slice(m.length).replace(/\D/g, ''); } else { parsedMobile = origDigits; } }
    } else {
      if (umpireCountry === 'india') parsedCode = '+91';
    }
    setEditOriginal({ name: u.umpireName || u.name || u.userName || u.fullName || '', address1: u.address1 || u.addressLine1 || '', address2: u.address2 || u.addressLine2 || '', city: u.city || '', state: u.state || '', country: u.country || '', zipcode: u.zipcode || u.zipCode || '', homePhone: u.homePhone || '', workPhone: u.workPhone || '', mobile: parsedMobile, countryCode: parsedCode, email: u.email || '' });
  };

  const handleEdit = (u: any) => {
    const uid = u.id || u.umpireId;
    setEditId(uid);
    setUpdateError('');
    setUpdateSuccess('');

    // Apply sessionStorage overlay to the list data before populating
    let editData = { ...u };
    try {
      const edits = JSON.parse(sessionStorage.getItem('umpireEdits') || '{}');
      if (edits[uid]) editData = { ...editData, ...edits[uid] };
    } catch {}

    // Pre-fill from list data (with overlay) immediately
    populateEditFields(editData);
    // Then fetch full data from API to ensure all fields are populated
    setEditLoading(true);
    leagueService.getUmpireById(boardId, uid)
      .then(res => {
        const raw = res.data as any;
        const full = raw?.data || raw;
        if (full && typeof full === 'object') {
          console.log('Umpire full data from API:', JSON.stringify(full, null, 2));
          // Merge: sessionStorage overlay > list data > API response (for countryCode/mobile)
          const mergedFull = { ...full };
          // Apply sessionStorage overlay on top of API response
          try {
            const edits = JSON.parse(sessionStorage.getItem('umpireEdits') || '{}');
            if (edits[uid]) {
              if (edits[uid].countryCode) mergedFull.countryCode = edits[uid].countryCode;
              if (edits[uid].mobile) mergedFull.mobile = edits[uid].mobile;
            }
          } catch {}
          populateEditFields(mergedFull);
        }
      })
      .catch(err => {
        console.warn('Failed to fetch umpire details, using list data:', err?.message);
      })
      .finally(() => setEditLoading(false));
  };

  // Restore edit form state from sessionStorage on mount (after page refresh)
  const editRestoredUmpireRef = useRef(false);
  useEffect(() => {
    if (editRestoredUmpireRef.current) return;
    if (!editId || editOriginal) return;
    const u = umpireList.find((x: any) => (x.id || x.umpireId) === editId);
    if (u) { editRestoredUmpireRef.current = true; handleEdit(u); }
  }, [editId, umpireList.length]);

  const cancelEdit = () => {
    const hasChanges = editOriginal && (editName !== editOriginal.name || editAddress1 !== editOriginal.address1 || editAddress2 !== editOriginal.address2 || editCity !== editOriginal.city || editState !== editOriginal.state || editCountry !== editOriginal.country || editZipcode !== editOriginal.zipcode || editHomePhone !== editOriginal.homePhone || editWorkPhone !== editOriginal.workPhone || editMobile !== editOriginal.mobile || editCountryCode !== editOriginal.countryCode || editEmail !== editOriginal.email);
    if (hasChanges) { setShowCancelConfirm(true); return; }
    setEditId(null);
    setUpdateError('');
  };

  const confirmCancel = () => {
    setShowCancelConfirm(false);
    setEditId(null);
    setUpdateError('');
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Umpire List</h2>
        {!showCreate && !editId && (
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-2">
            <span className="text-xl font-bold leading-none">+</span> Create Umpire
          </button>
        )}
      </div>

      {showCreate && (
        <div className="mb-6">
          <CreateUmpireTab boardId={boardId} onClose={() => setShowCreate(false)} />
        </div>
      )}

      {!showCreate && (
        <>
      {updateSuccess && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{updateSuccess}</div>}

      {/* Edit form */}
      {editId && (
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="bg-gray-100 px-6 py-3 border-b">
            <h2 className="text-base font-bold text-gray-800">Edit Umpire</h2>
          </div>
          <div className="p-6">
          {editLoading && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">Loading umpire details...</div>}
          {updateError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{updateError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            {/* Row 1 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Umpire Name <span className="text-red-500">*</span></label>
              <input value={editName} onChange={e => setEditName(sanitizeTextInput(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
              <input value={editAddress1} onChange={e => setEditAddress1(sanitizeTextInput(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
              <input value={editAddress2} onChange={e => setEditAddress2(sanitizeTextInput(e.target.value))} className="input-field" />
            </div>

            {/* Row 2: Country ? State ? City */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Country <span className="text-red-500">*</span></label>
              {countryDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCountryDropdownOpen(false); setCountrySearchText(''); }} />}
              <div
                className={`input-field cursor-pointer flex items-center justify-between border-gray-400 ${countriesLoading ? 'bg-gray-50' : ''}`}
                onClick={() => { if (!countriesLoading) setCountryDropdownOpen(!countryDropdownOpen); }}
              >
                <span className={editCountry ? 'text-gray-900' : 'text-gray-400'}>{countriesLoading ? 'Loading countries...' : editCountry || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${countryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {countryDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={countrySearchText} onChange={e => setCountrySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search country..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).map(c => (
                      <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${editCountry === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setEditCountry(c); setEditState(''); setEditCity(''); setCountryDropdownOpen(false); setCountrySearchText(''); }}>{c}</button>
                    ))}
                    {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
              {stateDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setStateDropdownOpen(false); setStateSearchText(''); }} />}
              <div
                className={`input-field flex items-center justify-between border-gray-400 ${!editCountry || statesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                onClick={() => { if (editCountry && !statesLoading) setStateDropdownOpen(!stateDropdownOpen); }}
              >
                <span className={editState ? 'text-gray-900' : 'text-gray-400'}>{!editCountry ? '' : statesLoading ? 'Loading states...' : editState || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${stateDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {stateDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={stateSearchText} onChange={e => setStateSearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search state..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).map(s => (
                      <button key={s} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${editState === s ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setEditState(s); setEditCity(''); setStateDropdownOpen(false); setStateSearchText(''); }}>{s}</button>
                    ))}
                    {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
              {cityDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCityDropdownOpen(false); setCitySearchText(''); }} />}
              <div
                className={`input-field flex items-center justify-between border-gray-400 ${!editState || citiesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                onClick={() => { if (editState && !citiesLoading) setCityDropdownOpen(!cityDropdownOpen); }}
              >
                <span className={editCity ? 'text-gray-900' : 'text-gray-400'}>{!editState ? '' : citiesLoading ? 'Loading...' : editCity || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${cityDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {cityDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={citySearchText} onChange={e => setCitySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search city..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).map(c => (
                      <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${editCity === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setEditCity(c); setCityDropdownOpen(false); setCitySearchText(''); }}>{c}</button>
                    ))}
                    {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Row 3 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code <span className="text-red-500">*</span></label>
              <input value={editZipcode} maxLength={editCountry === 'United States' ? 5 : 6} onChange={e => { const max = editCountry === 'United States' ? 5 : 6; setEditZipcode(e.target.value.replace(/\D/g, '').slice(0, max)); }} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
              <div className="flex gap-2">
                <div className="relative">
                  {editPhoneCodeDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setEditPhoneCodeDropdownOpen(false); setEditPhoneCodeSearchText(''); }} />}
                  <div
                    className="input-field text-sm w-36 cursor-pointer flex items-center gap-2"
                    onClick={() => { if (!editPhoneCodesLoading) setEditPhoneCodeDropdownOpen(!editPhoneCodeDropdownOpen); }}
                  >
                    <img src={editCountryCode === '+91' ? '/images/flag-in.svg' : '/images/flag-us.svg'} alt="" className="w-5 h-3.5 object-cover rounded-sm" />
                    <span className="flex-1 text-gray-900">{editPhoneCodesLoading ? 'Loading...' : (() => { const sel = editPhoneCodeList.find(c => c.dial_code === editCountryCode); return sel ? `${sel.dial_code} (${sel.code})` : `${editCountryCode}`; })()}</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${editPhoneCodeDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                  {editPhoneCodeDropdownOpen && (
                    <div className="absolute z-10 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg">
                      <div className="p-2 border-b border-gray-100">
                        <input type="text" value={editPhoneCodeSearchText} onChange={e => setEditPhoneCodeSearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search code..." autoFocus onClick={e => e.stopPropagation()} />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {(editPhoneCodeList.length > 0 ? editPhoneCodeList : [{ name: 'India', code: 'IN', dial_code: '+91', flag: '' }, { name: 'United States', code: 'US', dial_code: '+1', flag: '' }])
                          .filter(c => !editPhoneCodeSearchText || c.dial_code.includes(editPhoneCodeSearchText) || c.code.toLowerCase().includes(editPhoneCodeSearchText.toLowerCase()) || c.name.toLowerCase().includes(editPhoneCodeSearchText.toLowerCase()))
                          .map(c => (
                          <button key={`${c.code}-${c.dial_code}`} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 flex items-center gap-2 ${editCountryCode === c.dial_code ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                            onClick={() => { setEditCountryCode(c.dial_code); setEditPhoneCodeDropdownOpen(false); setEditPhoneCodeSearchText(''); }}>
                            <img src={c.code === 'IN' ? '/images/flag-in.svg' : '/images/flag-us.svg'} alt="" className="w-5 h-3.5 object-cover rounded-sm" />
                            {c.dial_code} ({c.code})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <input
                  value={(() => { const d = editMobile; if (editCountryCode === '+1' && d.length > 0) { const a = d.slice(0,3), b = d.slice(3,6), c = d.slice(6); return d.length <= 3 ? `(${a}` : d.length <= 6 ? `(${a}) ${b}` : `(${a}) ${b}-${c}`; } if (editCountryCode === '+91' && d.length > 0) { return d.length <= 5 ? d.slice(0,5) : `${d.slice(0,5)} ${d.slice(5)}`; } return d; })()}
                  maxLength={editCountryCode === '+1' ? 14 : 11}
                  onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setEditMobile(v); }}
                  className="input-field flex-1"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email ID <span className="text-red-500">*</span></label>
              <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="input-field" />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={cancelEdit} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={() => {
              const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,3}$/;
              if (!emailRegex.test(editEmail.trim())) { setUpdateError('Please enter a valid email address'); return; }
              setUpdateError('');
              updateMutation.mutate();
            }} disabled={!editName.trim() || !editCity.trim() || !editState.trim() || !editCountry.trim() || !editZipcode.trim() || !editEmail.trim() || updateMutation.isPending} className="btn-primary text-sm px-8">
              {updateMutation.isPending ? 'Updating...' : 'Update'}
            </button>
          </div>
          </div>
        </div>
      )}

      {/* View details (read-only) */}
      {viewId && !editId && (() => {
        const u: any = umpireList.find((x: any) => (x.id || x.umpireId) === viewId);
        if (!u) return null;
        const phone = formatPhone(u);
        // Resolve country code using same logic as edit mode
        const rawMobile = u.mobile || u.contactNumber || '';
        const apiCC = u.countryCode || '';
        const umpireCountry = (u.country || '').toLowerCase();
        let cCode = '+1';
        if (apiCC) {
          cCode = apiCC;
        } else if (rawMobile) {
          const digits = rawMobile.replace(/\D/g, '');
          if (digits.startsWith('91') && digits.length === 12) cCode = '+91';
          else if (digits.startsWith('1') && digits.length === 11) cCode = '+1';
          else if (umpireCountry === 'india') cCode = '+91';
          else cCode = '+1';
        } else {
          if (umpireCountry === 'india') cCode = '+91';
          else cCode = '+1';
        }
        return (
          <div className="bg-white rounded-lg shadow-sm mb-6">
            <div className="bg-gray-100 px-6 py-3 border-b">
              <h2 className="text-base font-bold text-gray-800">View Umpire</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
                {/* Row 1: Umpire Name, Address Line 1, Address Line 2 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Umpire Name</label>
                  <input value={u.umpireName || u.name || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                  <input value={u.address1 || u.addressLine1 || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                  <input value={u.address2 || u.addressLine2 || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>

                {/* Row 2: Country, State, City */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input value={u.country || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input value={u.state || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input value={u.city || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>

                {/* Row 3: Zip Code, Contact Number, Email ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                  <input value={u.zipcode || u.zipCode || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                  <div className="flex w-full border border-gray-400 rounded-lg h-[42px] bg-gray-100">
                    <div className="flex-shrink-0 h-full px-2 text-sm flex items-center gap-1 border-r border-gray-300 bg-gray-100 rounded-l-lg">
                      <img src={cCode === '+91' ? '/images/flag-in.svg' : '/images/flag-us.svg'} alt="" className="w-4 h-3 object-cover rounded-sm" />
                      <span className="text-gray-900 text-xs">{cCode}</span>
                    </div>
                    <input
                      value={phone || '-'}
                      readOnly
                      className="flex-1 min-w-0 px-3 h-full text-sm bg-transparent outline-none rounded-r-lg cursor-default"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email ID</label>
                  <input value={u.email || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <button onClick={() => setViewId(null)} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {!editId && !viewId && (
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-4 sm:p-6">
          {isLoading ? (
            <div className="py-8 text-center text-gray-400">Loading umpires...</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="text-white text-left font-bold text-sm" style={{backgroundColor: '#8091A5'}}>
                      <th className="py-3 px-4 rounded-tl-lg w-[18%]">Umpire Name</th>
                      <th className="py-3 px-4 w-[22%]">Email ID</th>
                      <th className="py-3 px-4 w-[18%]">Contact Number</th>
                      <th className="py-3 px-4 w-[16%]">Rating</th>
                      <th className="py-3 px-4 w-[14%]">Matches</th>
                      <th className="py-3 px-4 rounded-tr-lg w-[12%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {umpireList.map((u: any) => {
                      const uid = u.id || u.umpireId;
                      return (
                        <tr key={uid} className={`border-b last:border-b-0 hover:bg-gray-50 ${editId === uid ? 'bg-blue-50' : ''}`}>
                          <td className="py-3 px-4 font-medium truncate">{u.umpireName || u.name || '-'}</td>
                          <td className="py-3 px-4 truncate">{u.email || '-'}</td>
                          <td className="py-3 px-4 truncate">{formatPhone(u)}</td>
                          <td className="py-3 px-4 truncate">{u.rating != null ? `${'??'.repeat(Math.round(u.rating))} (${Number(u.rating).toFixed(1)})` : '-'}</td>
                          <td className="py-3 px-4">{u.totalMatches ?? '-'}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-4">
                              <button onClick={() => { setViewId(uid); setEditId(null); }} className="text-gray-500 hover:text-gray-700" title="View">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </button>
                              <button onClick={() => handleEdit(u)} className="text-blue-500 hover:text-blue-700" title="Edit">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button onClick={() => setDeleteConfirmId(uid)} disabled={deleteMutation.isPending} className="text-red-500 hover:text-red-700" title="Delete">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {(!umpireList.length) && (
                      <tr><td colSpan={6} className="py-8 text-center text-gray-400">No umpires created yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden space-y-4">
                {umpireList.map((u: any) => {
                  const uid = u.id || u.umpireId;
                  return (
                    <div key={uid} className={`border rounded-lg p-4 ${editId === uid ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-gray-800">{u.umpireName || u.name || '-'}</h3>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setViewId(uid); setEditId(null); }} className="text-gray-500 hover:text-gray-700" title="View">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
                          <button onClick={() => handleEdit(u)} className="text-blue-500 hover:text-blue-700" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => setDeleteConfirmId(uid)} disabled={deleteMutation.isPending} className="text-red-500 hover:text-red-700" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div><span className="text-gray-400">Email:</span> {u.email || '-'}</div>
                        <div><span className="text-gray-400">Phone:</span> {formatPhone(u)}</div>
                        <div><span className="text-gray-400">Rating:</span> {u.rating != null ? Number(u.rating).toFixed(1) : '-'}</div>
                        <div><span className="text-gray-400">Matches:</span> {u.totalMatches ?? '-'}</div>
                      </div>
                    </div>
                  );
                })}
                {(!umpireList.length) && (
                  <div className="py-8 text-center text-gray-400">No umpires created yet.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Delete Umpire?</h3>
              <p className="text-xs text-gray-500 mb-4">Are you sure you want to delete? This action cannot be undone.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">Cancel</button>
                <button onClick={() => { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); }} disabled={deleteMutation.isPending} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">
                  {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <h3 className="text-base font-bold text-gray-800 mb-1">Discard Changes?</h3>
              <p className="text-xs text-gray-500 mb-4">Are you sure you want to cancel? Any unsaved changes will be lost.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">No, Keep Editing</button>
                <button onClick={confirmCancel} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Yes, Discard</button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

// -- CREATE GROUND TAB --
function CreateGroundTab({ boardId, onCreated, onClose }: { boardId: string; onCreated?: () => void; onClose?: () => void }) {
  const [name, setName] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [landmark, setLandmark] = useState('');

  const [homeTeam, setHomeTeam] = useState('');
  const [selectedHomeTeam, setSelectedHomeTeam] = useState<{ id: string; name: string; logoUrl?: string } | null>(null);
  const [homeTeamSearch, setHomeTeamSearch] = useState('');
  const [showHomeTeamDropdown, setShowHomeTeamDropdown] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // New fields
  const [placeOfGround, setPlaceOfGround] = useState('');
  const [additionalDirection, setAdditionalDirection] = useState('');
  const [groundFacilities, setGroundFacilities] = useState('');
  const [pitchDescription, setPitchDescription] = useState('');
  const [wicketType, setWicketType] = useState('Regular Turf');
  const [permitHour, setPermitHour] = useState('');
  const [permitMinutes, setPermitMinutes] = useState('');
  const [permitSeconds, setPermitSeconds] = useState('');
  const [permitAmPm, setPermitAmPm] = useState('AM');
  const [permitTimezone, setPermitTimezone] = useState('EST');
  const [wicketDropdownOpen, setWicketDropdownOpen] = useState(false);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // Fetch existing grounds for duplicate name check
  const { data: existingGrounds } = useQuery({
    queryKey: ['grounds', boardId],
    queryFn: () => leagueService.getGrounds(boardId).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d as any)?.data ?? (d as any)?.items ?? [];
    }),
    enabled: !!boardId,
  });
  const existingGroundList = Array.isArray(existingGrounds) ? existingGrounds : [];

  // Location cascading dropdown state
  const [countryList, setCountryList] = useState<string[]>([]);
  const [stateList, setStateList] = useState<string[]>([]);
  const [cityList, setCityList] = useState<string[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [countrySearchText, setCountrySearchText] = useState('');
  const [stateSearchText, setStateSearchText] = useState('');
  const [citySearchText, setCitySearchText] = useState('');

  useEffect(() => {
    setCountriesLoading(true);
    fetchCountries().then(setCountryList).catch(() => setCountryList([])).finally(() => setCountriesLoading(false));
  }, []);

  useEffect(() => {
    if (!country) { setStateList([]); setCityList([]); return; }
    setStatesLoading(true);
    fetchStates(country).then(setStateList).catch(() => setStateList([])).finally(() => setStatesLoading(false));
    const max = country === 'United States' ? 5 : 6;
    setZipCode(prev => prev.slice(0, max));
  }, [country]);

  useEffect(() => {
    if (!country || !state) { setCityList([]); return; }
    setCitiesLoading(true);
    fetchCities(country, state).then(setCityList).catch(() => setCityList([])).finally(() => setCitiesLoading(false));
  }, [country, state]);

  // Fetch Team Boards associated to this league via GET /Boards/teamboards/league/{leagueBoardId}
  const { data: boardsList, isLoading: boardsLoading } = useQuery({
    queryKey: ['teamBoardsByLeague', boardId],
    queryFn: async () => {
      const res = await boardService.getTeamBoardsByLeague(boardId, 1, 50);
      const raw = res.data as any;
      console.log('[TeamBoards-League] API response:', raw);
      const items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? (Array.isArray(raw?.result) ? raw.result : []));
      return (Array.isArray(items) ? items : []).map((b: any) => ({
        id: b.id || b.Id || b.boardId || '',
        name: b.name || b.boardName || b.Name || '',
        logoUrl: b.logoUrl || '',
      }));
    },
    staleTime: 60000,
    retry: 1,
    enabled: !!boardId,
  });

  const teamList = Array.isArray(boardsList) ? boardsList : [];
  const filteredTeams = teamList.filter((b: any) => {
    const q = homeTeamSearch.toLowerCase();
    return !q || b.name?.toLowerCase().includes(q);
  });

  const resetForm = () => {
    setName(''); setAddress1(''); setAddress2('');
    setCity(''); setState(''); setCountry(''); setZipCode('');
    setLandmark(''); setHomeTeam(''); setSelectedHomeTeam(null); setHomeTeamSearch('');
    setPlaceOfGround(''); setAdditionalDirection(''); setGroundFacilities('');
    setPitchDescription(''); setWicketType('Regular Turf');
    setPermitHour(''); setPermitMinutes(''); setPermitSeconds(''); setPermitAmPm('AM'); setPermitTimezone('EST');
  };

  const createMutation = useMutation({
    mutationFn: () => {
      // Build permitTime as single string e.g. "01:30:00 PM EST"
      const permitTime = (permitHour && permitMinutes) ? `${permitHour.padStart(2, '0')}:${permitMinutes.padStart(2, '0')}:${(permitSeconds || '0').padStart(2, '0')} ${permitAmPm} ${permitTimezone}` : '';
      const payload = {
        boardId: boardId,
        groundName: name.trim(),
        address1: placeOfGround.trim(),
        address2: address1.trim(),
        placeOfGround: placeOfGround.trim(),
        city: city.trim(),
        state: state.trim(),
        country: country.trim(),
        zipcode: zipCode.trim(),
        landmark: landmark.trim(),
        homeTeam: homeTeam,
        additionalDirection: additionalDirection.trim(),
        groundFacilities: groundFacilities.trim(),
        pitchDescription: pitchDescription.trim(),
        wicketType: wicketType,
        permitTime: permitTime,
      };
      console.log('Creating ground with payload:', JSON.stringify(payload, null, 2));
      return leagueService.createGround(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grounds', boardId] });
      resetForm();
      setSuccessMsg('Ground created successfully!');
      setErrorMsg('');
      setTimeout(() => {
        setSuccessMsg('');
        onCreated?.();
        onClose?.();
      }, 1500);
    },
    onError: (err: any) => {
      console.error('Create ground error:', err?.response?.status, JSON.stringify(err?.response?.data, null, 2));
      const detail = err?.response?.data;
      const fieldErrors = detail?.errors ? Object.entries(detail.errors).map(([k, v]: [string, any]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ') : '';
      const status = err?.response?.status;
      const msg = (status === 500)
        ? 'A ground with this name already exists. Please try a different name.'
        : (fieldErrors
          || detail?.detail
          || detail?.message
          || detail?.title
          || (typeof detail === 'string' ? detail : '')
          || 'Failed to create ground. Please try again.');
      setErrorMsg(`${msg}${status && status !== 500 ? ` (Status: ${status})` : ''}`);
      setSuccessMsg('');
    },
  });

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!name.trim() || !city.trim() || !state.trim() || !country.trim() || !zipCode.trim() || !homeTeam.trim()) {
      setErrorMsg('Please fill in all mandatory fields: Ground Name, City, State, Country, Zip Code, Home Team.');
      return;
    }
    if (!permitHour.trim() || !permitMinutes.trim()) {
      setErrorMsg('Please fill in the Permit Time (HH and MM are required).');
      return;
    }
    // Client-side duplicate ground name check — fetch fresh list to be accurate
    try {
      const freshRes = await leagueService.getGrounds(boardId);
      const freshData = freshRes.data;
      const freshList = Array.isArray(freshData) ? freshData : (freshData as any)?.data ?? (freshData as any)?.items ?? [];
      const duplicate = freshList.find((g: any) =>
        (g.groundName || g.name || '').trim().toLowerCase() === name.trim().toLowerCase()
      );
      if (duplicate) {
        setErrorMsg('A ground with this name already exists. Please try a different name.');
        return;
      }
    } catch {
      // If fetch fails, fall through to server-side validation
    }
    createMutation.mutate();
  };

  const hasAnyData = () => name.trim() || address1.trim() || address2.trim() || city.trim() || state.trim() || country.trim() || zipCode.trim() || landmark.trim() || homeTeam.trim() || placeOfGround.trim() || additionalDirection.trim() || groundFacilities.trim() || pitchDescription.trim() || permitHour.trim() || permitMinutes.trim();

  const handleCancel = () => {
    if (hasAnyData()) { setShowCancelConfirm(true); return; }
    if (onClose) onClose();
  };

  const confirmCancel = () => {
    setShowCancelConfirm(false);
    resetForm();
    setErrorMsg('');
    setSuccessMsg('');
    if (onClose) onClose();
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-lg shadow-sm">
        <div className="bg-gray-100 px-6 py-3 border-b">
          <h2 className="text-base font-bold text-gray-800">Create Ground</h2>
        </div>
        <div className="p-6">
          {successMsg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{successMsg}</div>}
          {errorMsg && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{errorMsg}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            {/* Row 1: Ground Name, Place of Ground, Address Line 1 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ground Name <span className="text-red-500">*</span></label>
              <input value={name} onChange={e => setName(sanitizeTextInput(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Place of Ground <span className="text-red-500">*</span></label>
              <input value={placeOfGround} onChange={e => setPlaceOfGround(sanitizeTextInput(e.target.value, true))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
              <input value={address1} onChange={e => setAddress1(sanitizeTextInput(e.target.value, true))} className="input-field" />
            </div>

            {/* Row 2: Country, State, City */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Country <span className="text-red-500">*</span></label>
              {countryDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCountryDropdownOpen(false); setCountrySearchText(''); }} />}
              <div
                className={`input-field cursor-pointer flex items-center justify-between border-gray-400 ${countriesLoading ? 'bg-gray-50' : ''}`}
                onClick={() => { if (!countriesLoading) setCountryDropdownOpen(!countryDropdownOpen); }}
              >
                <span className={country ? 'text-gray-900' : 'text-gray-400'}>{countriesLoading ? 'Loading countries...' : country || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${countryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {countryDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={countrySearchText} onChange={e => setCountrySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search country..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).map(c => (
                      <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${country === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setCountry(c); setState(''); setCity(''); setCountryDropdownOpen(false); setCountrySearchText(''); }}>{c}</button>
                    ))}
                    {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
              {stateDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setStateDropdownOpen(false); setStateSearchText(''); }} />}
              <div
                className={`input-field flex items-center justify-between border-gray-400 ${!country || statesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                onClick={() => { if (country && !statesLoading) setStateDropdownOpen(!stateDropdownOpen); }}
              >
                <span className={state ? 'text-gray-900' : 'text-gray-400'}>{!country ? '' : statesLoading ? 'Loading states...' : state || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${stateDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {stateDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={stateSearchText} onChange={e => setStateSearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search state..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).map(s => (
                      <button key={s} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${state === s ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setState(s); setCity(''); setStateDropdownOpen(false); setStateSearchText(''); }}>{s}</button>
                    ))}
                    {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
              {cityDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCityDropdownOpen(false); setCitySearchText(''); }} />}
              <div
                className={`input-field flex items-center justify-between border-gray-400 ${!state || citiesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                onClick={() => { if (state && !citiesLoading) setCityDropdownOpen(!cityDropdownOpen); }}
              >
                <span className={city ? 'text-gray-900' : 'text-gray-400'}>{!state ? '' : citiesLoading ? 'Loading...' : city || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${cityDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {cityDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={citySearchText} onChange={e => setCitySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search city..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).map(c => (
                      <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${city === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setCity(c); setCityDropdownOpen(false); setCitySearchText(''); }}>{c}</button>
                    ))}
                    {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Row 3: Zip Code, Landmark, Home Team */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code <span className="text-red-500">*</span></label>
              <input value={zipCode} maxLength={country === 'United States' ? 5 : 6} onChange={e => { const max = country === 'United States' ? 5 : 6; setZipCode(e.target.value.replace(/\D/g, '').slice(0, max)); }} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
              <input value={landmark} onChange={e => setLandmark(sanitizeTextInput(e.target.value, true))} className="input-field" />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Home Team for the Ground <span className="text-red-500">*</span></label>
              {selectedHomeTeam ? (
                <div className="flex items-center gap-2 input-field bg-gray-50">
                  <div className="w-6 h-6 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs">
                    {selectedHomeTeam.logoUrl
                      ? <img src={selectedHomeTeam.logoUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                      : selectedHomeTeam.name?.[0]?.toUpperCase() || '?'
                    }
                  </div>
                  <span className="flex-1 text-sm truncate">{selectedHomeTeam.name}</span>
                  <button type="button" onClick={() => { setSelectedHomeTeam(null); setHomeTeam(''); setHomeTeamSearch(''); }} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                </div>
              ) : (
                <>
                  {showHomeTeamDropdown && (
                    <div className="fixed inset-0 z-[5]" onClick={() => { setShowHomeTeamDropdown(false); setHomeTeamSearch(''); }} />
                  )}
                  <div
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg cursor-pointer flex items-center justify-between"
                    onClick={() => setShowHomeTeamDropdown(!showHomeTeamDropdown)}
                  >
                    <span className="text-gray-400 text-sm">Select Team</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${showHomeTeamDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {showHomeTeamDropdown && (
                    <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-xl" style={{ top: '100%' }}>
                      <div className="p-2 border-b border-gray-100">
                        <input
                          type="text"
                          value={homeTeamSearch}
                          onChange={e => setHomeTeamSearch(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent"
                          placeholder="Search teams..."
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {boardsLoading ? (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading teams...</div>
                        ) : filteredTeams.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">No teams found</div>
                        ) : (
                          filteredTeams.map((b: any) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => { setSelectedHomeTeam(b); setHomeTeam(b.id); setShowHomeTeamDropdown(false); setHomeTeamSearch(''); }}
                              className="w-full text-left px-4 py-2 hover:bg-brand-green/5 flex items-center gap-2 text-sm border-b last:border-0"
                            >
                              <div className="w-7 h-7 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs">
                                {b.logoUrl
                                  ? <img src={b.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                                  : b.name?.[0]?.toUpperCase() || '?'
                                }
                              </div>
                              <span className="font-medium text-gray-900">{b.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Row 4: Additional Direction, Ground Facilities, Pitch Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Direction</label>
              <textarea rows={4} value={additionalDirection} onChange={e => setAdditionalDirection(sanitizeTextInput(e.target.value, true))} className="input-field resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ground Facilities</label>
              <textarea rows={4} value={groundFacilities} onChange={e => setGroundFacilities(sanitizeTextInput(e.target.value, true))} className="input-field resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pitch Description</label>
              <textarea rows={4} value={pitchDescription} onChange={e => setPitchDescription(sanitizeTextInput(e.target.value, true))} className="input-field resize-none" />
            </div>

            {/* Row 5: Wicket Type, Permit Time */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Wicket Type</label>
              {wicketDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => setWicketDropdownOpen(false)} />}
              <div
                className="input-field cursor-pointer flex items-center justify-between"
                onClick={() => setWicketDropdownOpen(!wicketDropdownOpen)}
              >
                <span className="text-gray-900">{wicketType}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${wicketDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {wicketDropdownOpen && (
                <div className="absolute z-10 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  {['Regular Turf', 'Artificial Turf', 'Matting', 'Concrete', 'Indoor'].map(wt => (
                    <button key={wt} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${wicketType === wt ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                      onClick={() => { setWicketType(wt); setWicketDropdownOpen(false); }}>{wt}</button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Permit Time <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-2">
                <select
                  value={permitHour}
                  onChange={e => setPermitHour(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="">HH</option>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span className="text-gray-500 font-bold">:</span>
                <select
                  value={permitMinutes}
                  onChange={e => setPermitMinutes(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="">MM</option>
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span className="text-gray-500 font-bold">:</span>
                <select
                  value={permitSeconds}
                  onChange={e => setPermitSeconds(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="">SS</option>
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={permitAmPm}
                  onChange={e => setPermitAmPm(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                <select
                  value={permitTimezone}
                  onChange={e => setPermitTimezone(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="EST">EST</option>
                  <option value="IST">IST</option>
                </select>
              </div>
            </div>
            <div>{/* spacer */}</div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={handleCancel}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !name.trim() || !city.trim() || !state.trim() || !country.trim() || !zipCode.trim() || !homeTeam.trim() || !permitHour.trim() || !permitMinutes.trim()}
              className="btn-primary px-8 py-2 text-sm"
            >
              {createMutation.isPending ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Discard Changes?</h3>
              <p className="text-xs text-gray-500 mb-4">You have unsaved changes. Are you sure you want to discard them?</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">No, Keep Editing</button>
                <button onClick={confirmCancel} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Yes, Discard</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- GROUND LIST TAB --
function GroundListTab({ boardId, onDirtyChange }: { boardId: string; onDirtyChange?: (dirty: boolean) => void }) {
  const qc = useQueryClient();
  const [showCreate, _setShowCreateGround] = useState(() => sessionStorage.getItem('ground_mode') === 'create');
  const setShowCreate = (v: boolean) => { _setShowCreateGround(v); if (v) sessionStorage.setItem('ground_mode', 'create'); else sessionStorage.removeItem('ground_mode'); };
  const [editId, _setEditId] = useState<string | null>(() => sessionStorage.getItem('groundEditId') || null);
  const setEditId = (id: string | null) => { _setEditId(id); if (id) sessionStorage.setItem('groundEditId', id); else sessionStorage.removeItem('groundEditId'); };
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAddress1, setEditAddress1] = useState('');
  const [editAddress2, setEditAddress2] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editZipcode, setEditZipcode] = useState('');
  const [editLandmark, setEditLandmark] = useState('');
  const [editHomeTeam, setEditHomeTeam] = useState('');
  const [editSelectedHomeTeam, setEditSelectedHomeTeam] = useState<{ id: string; name: string; logoUrl?: string } | null>(null);
  const [editHomeTeamSearch, setEditHomeTeamSearch] = useState('');
  const [editShowHomeTeamDropdown, setEditShowHomeTeamDropdown] = useState(false);
  const [updateError, setUpdateError] = useState('');
  // New ground fields for edit
  const [editPlaceOfGround, setEditPlaceOfGround] = useState('');
  const [editAdditionalDirection, setEditAdditionalDirection] = useState('');
  const [editGroundFacilities, setEditGroundFacilities] = useState('');
  const [editPitchDescription, setEditPitchDescription] = useState('');
  const [editWicketType, setEditWicketType] = useState('Regular Turf');
  const [editPermitHour, setEditPermitHour] = useState('');
  const [editPermitMinutes, setEditPermitMinutes] = useState('');
  const [editPermitSeconds, setEditPermitSeconds] = useState('');
  const [editPermitAmPm, setEditPermitAmPm] = useState('AM');
  const [editPermitTimezone, setEditPermitTimezone] = useState('EST');
  const [editWicketDropdownOpen, setEditWicketDropdownOpen] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [editOriginal, setEditOriginal] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Location cascading dropdown state for edit form
  const [countryList, setCountryList] = useState<string[]>([]);
  const [stateList, setStateList] = useState<string[]>([]);
  const [cityList, setCityList] = useState<string[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [stateDropdownOpen, setStateDropdownOpen] = useState(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [countrySearchText, setCountrySearchText] = useState('');
  const [stateSearchText, setStateSearchText] = useState('');
  const [citySearchText, setCitySearchText] = useState('');

  useEffect(() => {
    setCountriesLoading(true);
    fetchCountries().then(setCountryList).catch(() => setCountryList([])).finally(() => setCountriesLoading(false));
  }, []);

  useEffect(() => {
    if (!editCountry) { setStateList([]); setCityList([]); return; }
    setStatesLoading(true);
    fetchStates(editCountry).then(setStateList).catch(() => setStateList([])).finally(() => setStatesLoading(false));
    const max = editCountry === 'United States' ? 5 : 6;
    setEditZipcode(prev => prev.slice(0, max));
  }, [editCountry]);

  useEffect(() => {
    if (!editCountry || !editState) { setCityList([]); return; }
    setCitiesLoading(true);
    fetchCities(editCountry, editState).then(setCityList).catch(() => setCityList([])).finally(() => setCitiesLoading(false));
  }, [editCountry, editState]);

  useEffect(() => { onDirtyChange?.(showCreate || !!editId); }, [showCreate, editId]);

  // Fetch all team boards for home team edit dropdown
  const { data: editTeamBoards, isLoading: editTeamsLoading } = useQuery({
    queryKey: ['allTeamBoards'],
    queryFn: async () => {
      try {
        const res = await boardService.getMyBoards(1, 200);
        const raw = res.data as any;
        const items = Array.isArray(raw) ? raw : raw?.data || raw?.items || [];
        return items
          .filter((b: any) => (b.boardType === 1 || b.boardType === 'Team'))
          .map((b: any) => ({
            id: b.id || b.Id || b.boardId || '',
            name: b.name || b.boardName || b.Name || '',
            logoUrl: b.logoUrl || '',
          }));
      } catch {
        return [];
      }
    },
    staleTime: 30000,
  });
  const editTeamList = Array.isArray(editTeamBoards) ? editTeamBoards : [];

  // Re-resolve selectedHomeTeam once editTeamList loads (homeTeam may be a GUID)
  useEffect(() => {
    if (editHomeTeam && !editSelectedHomeTeam && editTeamList.length > 0) {
      const matched = editTeamList.find((b: any) => b.id === editHomeTeam || b.name === editHomeTeam);
      if (matched) setEditSelectedHomeTeam(matched);
    }
  }, [editTeamList, editHomeTeam, editSelectedHomeTeam]);

  const editFilteredTeams = editTeamList.filter((b: any) => {
    const q = editHomeTeamSearch.toLowerCase();
    return !q || b.name?.toLowerCase().includes(q);
  });

  const { data: grounds, isLoading } = useQuery({
    queryKey: ['grounds', boardId],
    queryFn: () => leagueService.getGrounds(boardId).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d as any)?.data ?? (d as any)?.items ?? [];
    }),
    enabled: !!boardId,
  });
  const groundList = (Array.isArray(grounds) ? grounds : []).slice().sort((a: any, b: any) => {
    const nameA = (a.groundName || a.name || '').toLowerCase();
    const nameB = (b.groundName || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => leagueService.deleteGround(boardId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grounds', boardId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const permitTime = (editPermitHour && editPermitMinutes) ? `${editPermitHour.padStart(2, '0')}:${editPermitMinutes.padStart(2, '0')}:${(editPermitSeconds || '0').padStart(2, '0')} ${editPermitAmPm} ${editPermitTimezone}` : '';
      return leagueService.updateGround(boardId, editId!, {
        id: editId!,
        groundId: editId!,
        groundName: editName,
        address1: editPlaceOfGround,
        address2: editAddress1,
        placeOfGround: editPlaceOfGround,
        city: editCity,
        state: editState,
        country: editCountry,
        zipcode: editZipcode,
        landmark: editLandmark,
        homeTeam: editHomeTeam,
        additionalDirection: editAdditionalDirection,
        groundFacilities: editGroundFacilities,
        pitchDescription: editPitchDescription,
        wicketType: editWicketType,
        permitTime: permitTime,
      });
    },
    onSuccess: () => {
      // Persist the edit overlay in sessionStorage so permitTime timezone survives refetch
      const groundOverlay = {
        permitTime: (editPermitHour && editPermitMinutes) ? `${editPermitHour.padStart(2, '0')}:${editPermitMinutes.padStart(2, '0')}:${(editPermitSeconds || '0').padStart(2, '0')} ${editPermitAmPm} ${editPermitTimezone}` : '',
      };
      try {
        const pending = JSON.parse(sessionStorage.getItem('groundEdits') || '{}');
        pending[editId!] = groundOverlay;
        sessionStorage.setItem('groundEdits', JSON.stringify(pending));
      } catch {}
      qc.invalidateQueries({ queryKey: ['grounds', boardId] });
      setEditId(null);
      setUpdateError('');
      setUpdateSuccess('Ground updated successfully!');
      setTimeout(() => setUpdateSuccess(''), 4000);
    },
    onError: (error: any) => {
      const detail = error?.response?.data;
      const status = error?.response?.status;
      const fieldErrors = detail?.errors ? Object.entries(detail.errors).map(([k, v]: [string, any]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('; ') : '';
      // Detect duplicate ground name from server error
      if (status === 500 || status === 409 || status === 400) {
        const errStr = JSON.stringify(detail).toLowerCase();
        if (errStr.includes('duplicate') || errStr.includes('already exists') || errStr.includes('unique') || errStr.includes('conflict')) {
          setUpdateError('A ground with this name already exists. Please use a different name.');
          return;
        }
      }
      if (status === 500 && (!detail || typeof detail !== 'object' || !fieldErrors)) {
        setUpdateError('A ground with this name already exists. Please use a different name.');
        return;
      }
      const msg = fieldErrors
        || detail?.detail
        || detail?.message
        || detail?.title
        || (typeof detail === 'string' ? detail : '')
        || 'Failed to update ground. Please try again.';
      setUpdateError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    },
  });

  const populateGroundFields = (g: any) => {
    setEditName(g.groundName || '');
    setEditAddress1(g.address2 || '');
    setEditAddress2('');
    setEditCity(g.city || '');
    setEditState(g.state || '');
    setEditCountry(g.country || '');
    setEditZipcode(g.zipcode || '');
    setEditLandmark(g.landmark || '');
    setEditHomeTeam(g.homeTeam || '');
    const matchedTeam = editTeamList.find((b: any) => b.id === (g.homeTeam || '') || b.name === (g.homeTeam || ''));
    setEditSelectedHomeTeam(matchedTeam || null);
    setEditHomeTeamSearch('');
    setEditPlaceOfGround(g.address1 || g.placeOfGround || '');
    // API uses typo "additonalDirection"
    setEditAdditionalDirection(g.additionalDirection || g.additonalDirection || '');
    setEditGroundFacilities(g.groundFacilities || '');
    setEditPitchDescription(g.pitchDescription || '');
    setEditWicketType(g.wicketType || 'Regular Turf');
    // Parse permitTime string "HH:MM:SS AM/PM TZ" into separate fields
    // Apply sessionStorage overlay if available (API may not persist timezone)
    let pt = g.permitTime || '';
    try {
      const edits = JSON.parse(sessionStorage.getItem('groundEdits') || '{}');
      const gid = g.id || g.groundId;
      if (edits[gid]?.permitTime) pt = edits[gid].permitTime;
    } catch {}
    const ptMatch = pt.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)(?:\s+(\w+))?$/i);
    setEditPermitHour(ptMatch ? ptMatch[1] : '');
    setEditPermitMinutes(ptMatch ? ptMatch[2] : '');
    setEditPermitSeconds(ptMatch && ptMatch[3] ? ptMatch[3] : '');
    setEditPermitAmPm(ptMatch && ptMatch[4] ? ptMatch[4].toUpperCase() : 'AM');
    setEditPermitTimezone(ptMatch && ptMatch[5] ? ptMatch[5].toUpperCase() : 'EST');
    const dirVal = g.additionalDirection || g.additonalDirection || '';
    setEditOriginal({ name: g.groundName || '', address1: g.address2 || '', address2: '', city: g.city || '', state: g.state || '', country: g.country || '', zipcode: g.zipcode || '', landmark: g.landmark || '', homeTeam: g.homeTeam || '', placeOfGround: g.address1 || g.placeOfGround || '', additionalDirection: dirVal, groundFacilities: g.groundFacilities || '', pitchDescription: g.pitchDescription || '', wicketType: g.wicketType || 'Regular Turf', permitTimeHour: ptMatch ? ptMatch[1] : '', permitTimeMinutes: ptMatch ? ptMatch[2] : '', permitTimeSeconds: ptMatch && ptMatch[3] ? ptMatch[3] : '', permitTimeAmPm: ptMatch && ptMatch[4] ? ptMatch[4].toUpperCase() : 'AM', permitTimeTimezone: ptMatch && ptMatch[5] ? ptMatch[5].toUpperCase() : 'EST' });
  };

  const handleEdit = (g: any) => {
    const gid = g.id || g.groundId;
    setEditId(gid);
    setUpdateError('');
    setUpdateSuccess('');
    // Pre-fill from list data immediately
    populateGroundFields(g);
    // Then fetch full data from API
    setEditLoading(true);
    leagueService.getGroundById(boardId, gid)
      .then(res => {
        const raw = res.data as any;
        const full = raw?.data || raw;
        if (full && typeof full === 'object') {
          console.log('Ground full data from API:', JSON.stringify(full, null, 2));
          populateGroundFields(full);
        }
      })
      .catch(err => {
        console.warn('Failed to fetch ground details, using list data:', err?.message);
      })
      .finally(() => setEditLoading(false));
  };

  // Restore edit form state from sessionStorage on mount (after page refresh)
  const editRestoredGroundRef = useRef(false);
  useEffect(() => {
    if (editRestoredGroundRef.current) return;
    if (!editId || editOriginal) return;
    const g = groundList.find((x: any) => (x.id || x.groundId) === editId);
    if (g) { editRestoredGroundRef.current = true; handleEdit(g); }
  }, [editId, groundList.length]);

  const cancelEdit = () => {
    const hasChanges = editOriginal && (editName !== editOriginal.name || editAddress1 !== editOriginal.address1 || editAddress2 !== editOriginal.address2 || editCity !== editOriginal.city || editState !== editOriginal.state || editCountry !== editOriginal.country || editZipcode !== editOriginal.zipcode || editLandmark !== editOriginal.landmark || editHomeTeam !== editOriginal.homeTeam || editPlaceOfGround !== editOriginal.placeOfGround || editAdditionalDirection !== editOriginal.additionalDirection || editGroundFacilities !== editOriginal.groundFacilities || editPitchDescription !== editOriginal.pitchDescription || editWicketType !== editOriginal.wicketType || editPermitHour !== editOriginal.permitTimeHour || editPermitMinutes !== editOriginal.permitTimeMinutes || editPermitAmPm !== editOriginal.permitTimeAmPm);
    if (hasChanges) { setShowCancelConfirm(true); return; }
    setEditId(null);
    setUpdateError('');
  };

  const confirmCancel = () => {
    setShowCancelConfirm(false);
    setEditId(null);
    setUpdateError('');
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Ground List</h2>
        {!showCreate && !editId && (
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-2">
            <span className="text-xl font-bold leading-none">+</span> Create Ground
          </button>
        )}
      </div>

      {showCreate && (
        <div className="mb-6">
          <CreateGroundTab boardId={boardId} onClose={() => setShowCreate(false)} />
        </div>
      )}

      {!showCreate && (
        <>
      {updateSuccess && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{updateSuccess}</div>}

      {/* Edit form */}
      {editId && (
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="bg-gray-100 px-6 py-3 border-b">
            <h2 className="text-base font-bold text-gray-800">Edit Ground</h2>
          </div>
          <div className="p-6">
          {editLoading && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">Loading ground details...</div>}
          {updateError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{updateError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            {/* Row 1: Ground Name, Place of Ground, Address Line 1 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ground Name <span className="text-red-500">*</span></label>
              <input value={editName} onChange={e => setEditName(sanitizeTextInput(e.target.value))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Place of Ground <span className="text-red-500">*</span></label>
              <input value={editPlaceOfGround} onChange={e => setEditPlaceOfGround(sanitizeTextInput(e.target.value, true))} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
              <input value={editAddress1} onChange={e => setEditAddress1(sanitizeTextInput(e.target.value, true))} className="input-field" />
            </div>

            {/* Row 2: Country, State, City */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Country <span className="text-red-500">*</span></label>
              {countryDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCountryDropdownOpen(false); setCountrySearchText(''); }} />}
              <div
                className={`input-field cursor-pointer flex items-center justify-between border-gray-400 ${countriesLoading ? 'bg-gray-50' : ''}`}
                onClick={() => { if (!countriesLoading) setCountryDropdownOpen(!countryDropdownOpen); }}
              >
                <span className={editCountry ? 'text-gray-900' : 'text-gray-400'}>{countriesLoading ? 'Loading countries...' : editCountry || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${countryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {countryDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={countrySearchText} onChange={e => setCountrySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search country..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).map(c => (
                      <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${editCountry === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setEditCountry(c); setEditState(''); setEditCity(''); setCountryDropdownOpen(false); setCountrySearchText(''); }}>{c}</button>
                    ))}
                    {countryList.filter(c => !countrySearchText || c.toLowerCase().includes(countrySearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">State <span className="text-red-500">*</span></label>
              {stateDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setStateDropdownOpen(false); setStateSearchText(''); }} />}
              <div
                className={`input-field flex items-center justify-between border-gray-400 ${!editCountry || statesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                onClick={() => { if (editCountry && !statesLoading) setStateDropdownOpen(!stateDropdownOpen); }}
              >
                <span className={editState ? 'text-gray-900' : 'text-gray-400'}>{!editCountry ? '' : statesLoading ? 'Loading states...' : editState || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${stateDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {stateDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={stateSearchText} onChange={e => setStateSearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search state..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).map(s => (
                      <button key={s} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${editState === s ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setEditState(s); setEditCity(''); setStateDropdownOpen(false); setStateSearchText(''); }}>{s}</button>
                    ))}
                    {stateList.filter(s => !stateSearchText || s.toLowerCase().includes(stateSearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">City <span className="text-red-500">*</span></label>
              {cityDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => { setCityDropdownOpen(false); setCitySearchText(''); }} />}
              <div
                className={`input-field flex items-center justify-between border-gray-400 ${!editState || citiesLoading ? 'bg-gray-200 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
                onClick={() => { if (editState && !citiesLoading) setCityDropdownOpen(!cityDropdownOpen); }}
              >
                <span className={editCity ? 'text-gray-900' : 'text-gray-400'}>{!editState ? '' : citiesLoading ? 'Loading...' : editCity || ''}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${cityDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {cityDropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  <div className="p-2 border-b border-gray-100">
                    <input type="text" value={citySearchText} onChange={e => setCitySearchText(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent" placeholder="Search city..." autoFocus onClick={e => e.stopPropagation()} />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).map(c => (
                      <button key={c} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${editCity === c ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                        onClick={() => { setEditCity(c); setCityDropdownOpen(false); setCitySearchText(''); }}>{c}</button>
                    ))}
                    {cityList.filter(c => !citySearchText || c.toLowerCase().includes(citySearchText.toLowerCase())).length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-400 text-center">No results</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Row 3: Zip Code, Landmark, Home Team */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code <span className="text-red-500">*</span></label>
              <input value={editZipcode} maxLength={editCountry === 'United States' ? 5 : 6} onChange={e => { const max = editCountry === 'United States' ? 5 : 6; setEditZipcode(e.target.value.replace(/\D/g, '').slice(0, max)); }} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
              <input value={editLandmark} onChange={e => setEditLandmark(sanitizeTextInput(e.target.value, true))} className="input-field" />
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Home Team for the Ground <span className="text-red-500">*</span></label>
              {editSelectedHomeTeam ? (
                <div className="flex items-center gap-2 input-field bg-gray-50">
                  <div className="w-6 h-6 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs">
                    {editSelectedHomeTeam.logoUrl
                      ? <img src={editSelectedHomeTeam.logoUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                      : editSelectedHomeTeam.name?.[0]?.toUpperCase() || '?'
                    }
                  </div>
                  <span className="flex-1 text-sm truncate">{editSelectedHomeTeam.name}</span>
                  <button type="button" onClick={() => { setEditSelectedHomeTeam(null); setEditHomeTeam(''); setEditHomeTeamSearch(''); }} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                </div>
              ) : (
                <>
                  {editShowHomeTeamDropdown && (
                    <div className="fixed inset-0 z-[5]" onClick={() => { setEditShowHomeTeamDropdown(false); setEditHomeTeamSearch(''); }} />
                  )}
                  <div
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg cursor-pointer flex items-center justify-between"
                    onClick={() => setEditShowHomeTeamDropdown(!editShowHomeTeamDropdown)}
                  >
                    <span className="text-gray-400 text-sm">Select Team</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${editShowHomeTeamDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {editShowHomeTeamDropdown && (
                    <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-xl" style={{ top: '100%' }}>
                      <div className="p-2 border-b border-gray-100">
                        <input
                          type="text"
                          value={editHomeTeamSearch}
                          onChange={e => setEditHomeTeamSearch(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent"
                          placeholder="Search teams..."
                          autoFocus
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {editTeamsLoading ? (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading teams...</div>
                        ) : editFilteredTeams.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">No teams found</div>
                        ) : (
                          editFilteredTeams.map((b: any) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => { setEditSelectedHomeTeam(b); setEditHomeTeam(b.name); setEditShowHomeTeamDropdown(false); setEditHomeTeamSearch(''); }}
                              className="w-full text-left px-4 py-2 hover:bg-brand-green/5 flex items-center gap-2 text-sm border-b last:border-0"
                            >
                              <div className="w-7 h-7 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs">
                                {b.logoUrl
                                  ? <img src={b.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                                  : b.name?.[0]?.toUpperCase() || '?'
                                }
                              </div>
                              <span className="font-medium text-gray-900">{b.name}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Row 4: Additional Direction, Ground Facilities, Pitch Description (textareas) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional Direction</label>
              <textarea value={editAdditionalDirection} onChange={e => setEditAdditionalDirection(sanitizeTextInput(e.target.value, true))} rows={4} className="input-field resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ground Facilities</label>
              <textarea value={editGroundFacilities} onChange={e => setEditGroundFacilities(sanitizeTextInput(e.target.value, true))} rows={4} className="input-field resize-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pitch Description</label>
              <textarea value={editPitchDescription} onChange={e => setEditPitchDescription(sanitizeTextInput(e.target.value, true))} rows={4} className="input-field resize-none" />
            </div>

            {/* Row 5: Wicket Type, Permit Time */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Wicket Type</label>
              {editWicketDropdownOpen && <div className="fixed inset-0 z-[5]" onClick={() => setEditWicketDropdownOpen(false)} />}
              <div
                className="input-field cursor-pointer flex items-center justify-between"
                onClick={() => setEditWicketDropdownOpen(!editWicketDropdownOpen)}
              >
                <span className="text-gray-900">{editWicketType}</span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${editWicketDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
              {editWicketDropdownOpen && (
                <div className="absolute z-10 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                  {['Regular Turf', 'Artificial Turf', 'Matting', 'Concrete', 'Indoor'].map(wt => (
                    <button key={wt} className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green/10 ${editWicketType === wt ? 'bg-brand-green/10 text-brand-green font-medium' : 'text-gray-700'}`}
                      onClick={() => { setEditWicketType(wt); setEditWicketDropdownOpen(false); }}>{wt}</button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Permit Time <span className="text-red-500">*</span></label>
              <div className="flex items-center gap-2">
                <select
                  value={editPermitHour}
                  onChange={e => setEditPermitHour(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="">HH</option>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span className="text-gray-500 font-bold">:</span>
                <select
                  value={editPermitMinutes}
                  onChange={e => setEditPermitMinutes(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="">MM</option>
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span className="text-gray-500 font-bold">:</span>
                <select
                  value={editPermitSeconds}
                  onChange={e => setEditPermitSeconds(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="">SS</option>
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={editPermitAmPm}
                  onChange={e => setEditPermitAmPm(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
                <select
                  value={editPermitTimezone}
                  onChange={e => setEditPermitTimezone(e.target.value)}
                  className="input-field w-20 text-center appearance-none cursor-pointer"
                >
                  <option value="EST">EST</option>
                  <option value="IST">IST</option>
                </select>
              </div>
            </div>
            <div>{/* spacer */}</div>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={cancelEdit} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={async () => {
              // Client-side duplicate ground name check (exclude current ground) — fetch fresh list
              try {
                const freshRes = await leagueService.getGrounds(boardId);
                const freshData = freshRes.data;
                const freshList = Array.isArray(freshData) ? freshData : (freshData as any)?.data ?? (freshData as any)?.items ?? [];
                const duplicate = freshList.find((g: any) => {
                  const gid = g.id || g.groundId;
                  return gid !== editId && (g.groundName || g.name || '').trim().toLowerCase() === editName.trim().toLowerCase();
                });
                if (duplicate) {
                  setUpdateError('A ground with this name already exists. Please try a different name.');
                  return;
                }
              } catch {
                // If fetch fails, fall through to server-side validation
              }
              setUpdateError('');
              updateMutation.mutate();
            }} disabled={!editName.trim() || !editCity.trim() || !editState.trim() || !editCountry.trim() || !editZipcode.trim() || !editHomeTeam.trim() || !editPermitHour.trim() || !editPermitMinutes.trim() || updateMutation.isPending} className="btn-primary text-sm px-8">
              {updateMutation.isPending ? 'Updating...' : 'Update'}
            </button>
          </div>
          </div>
        </div>
      )}

      {/* View details (read-only) */}
      {viewId && !editId && (() => {
        const g = groundList.find((x: any) => (x.id || x.groundId) === viewId);
        if (!g) return null;
        const homeTeamBoard = g.homeTeam ? editTeamList.find((b: any) => b.id === g.homeTeam) : null;
        const homeTeamDisplay = homeTeamBoard?.name || g.homeTeamName || (!g.homeTeam ? '-' : g.homeTeam);
        // Parse permitTime string e.g. "11:16:16 AM IST" into parts
        // Also check sessionStorage overlay (API may not persist timezone)
        let ptRaw = g.permitTime || '';
        try {
          const edits = JSON.parse(sessionStorage.getItem('groundEdits') || '{}');
          const gid2 = g.id || g.groundId;
          if (edits[gid2]?.permitTime) ptRaw = edits[gid2].permitTime;
        } catch {}
        let ptHour = '-', ptMin = '-', ptSec = '-', ptAmPm = '-', ptTz = '-';
        if (ptRaw) {
          const ptMatch = ptRaw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)(?:\s+(\w+))?$/i);
          if (ptMatch) {
            ptHour = ptMatch[1]; ptMin = ptMatch[2]; ptSec = ptMatch[3] || '00';
            ptAmPm = ptMatch[4].toUpperCase(); ptTz = ptMatch[5]?.toUpperCase() || 'EST';
          }
        }
        return (
          <div className="bg-white rounded-lg shadow-sm mb-6">
            <div className="bg-gray-100 px-6 py-3 border-b">
              <h2 className="text-base font-bold text-gray-800">View Ground</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ground Name</label>
                  <input value={g.groundName || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Place of Ground</label>
                  <input value={g.address1 || g.placeOfGround || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                  <input value={g.address2 || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input value={g.country || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input value={g.state || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input value={g.city || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                  <input value={g.zipcode || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
                  <input value={g.landmark || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home Team for the Ground</label>
                  <input value={homeTeamDisplay} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Direction</label>
                  <input value={g.additionalDirection || g.additonalDirection || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ground Facilities</label>
                  <input value={g.groundFacilities || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pitch Description</label>
                  <input value={g.pitchDescription || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wicket Type</label>
                  <input value={g.wicketType || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Permit Time</label>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-16 text-center py-2 border border-gray-400 rounded-lg text-sm text-gray-900 bg-gray-100">{ptHour}</span>
                    <span className="text-gray-500 font-bold">:</span>
                    <span className="inline-block w-16 text-center py-2 border border-gray-400 rounded-lg text-sm text-gray-900 bg-gray-100">{ptMin}</span>
                    <span className="text-gray-500 font-bold">:</span>
                    <span className="inline-block w-16 text-center py-2 border border-gray-400 rounded-lg text-sm text-gray-900 bg-gray-100">{ptSec}</span>
                    <span className="inline-block w-16 text-center py-2 border border-gray-400 rounded-lg text-sm text-gray-900 bg-gray-100">{ptAmPm}</span>
                    <span className="inline-block w-16 text-center py-2 border border-gray-400 rounded-lg text-sm text-gray-900 bg-gray-100">{ptTz}</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <button onClick={() => setViewId(null)} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {!editId && !viewId && (
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-4 sm:p-6">
          {isLoading ? (
            <div className="py-8 text-center text-gray-400">Loading grounds...</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="text-white text-left font-bold text-sm" style={{backgroundColor: '#8091A5'}}>
                      <th className="py-3 px-4 rounded-tl-lg w-[18%]">Ground Name</th>
                      <th className="py-3 px-4 w-[14%]">Country</th>
                      <th className="py-3 px-4 w-[22%]">State</th>
                      <th className="py-3 px-4 w-[14%]">City</th>
                      <th className="py-3 px-4 w-[22%]">Home Team</th>
                      <th className="py-3 px-4 rounded-tr-lg w-[10%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groundList.map((g: any) => {
                      const gid = g.id || g.groundId;
                      const homeTeamBoard = g.homeTeam ? editTeamList.find((b: any) => b.id === g.homeTeam) : null;
                      const homeTeamDisplay = homeTeamBoard?.name || g.homeTeamName || (!g.homeTeam ? '-' : g.homeTeam);
                      return (
                        <tr key={gid} className={`border-b last:border-b-0 hover:bg-gray-50 ${editId === gid ? 'bg-blue-50' : ''}`}>
                          <td className="py-3 px-4 font-medium truncate">{g.groundName || '-'}</td>
                          <td className="py-3 px-4 truncate">{g.country || '-'}</td>
                          <td className="py-3 px-4 truncate">{g.state || '-'}</td>
                          <td className="py-3 px-4 truncate">{g.city || '-'}</td>
                          <td className="py-3 px-4 truncate">{homeTeamDisplay}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-4">
                              <button onClick={() => { setViewId(gid); setEditId(null); }} className="text-gray-500 hover:text-gray-700" title="View">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </button>
                              <button onClick={() => handleEdit(g)} className="text-blue-500 hover:text-blue-700" title="Edit">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button onClick={() => setDeleteConfirmId(gid)} disabled={deleteMutation.isPending} className="text-red-500 hover:text-red-700" title="Delete">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {(!groundList.length) && (
                      <tr><td colSpan={6} className="py-8 text-center text-gray-400">No grounds created yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden space-y-4">
                {groundList.map((g: any) => {
                  const gid = g.id || g.groundId;
                  const mobileHomeTeam = g.homeTeam ? (editTeamList.find((b: any) => b.id === g.homeTeam)?.name || g.homeTeamName || g.homeTeam) : '-';
                  return (
                    <div key={gid} className={`border rounded-lg p-4 ${editId === gid ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">???</span>
                          <h3 className="font-medium text-gray-800">{g.groundName || '-'}</h3>
                        </div>
                        <div className="flex items-center gap-4">
                          <button onClick={() => { setViewId(gid); setEditId(null); }} className="text-gray-500 hover:text-gray-700" title="View">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
                          <button onClick={() => handleEdit(g)} className="text-blue-500 hover:text-blue-700" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => setDeleteConfirmId(gid)} disabled={deleteMutation.isPending} className="text-red-500 hover:text-red-700" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                      <div><span className="text-gray-400">Country:</span> {g.country || '-'}</div>
                      <div><span className="text-gray-400">State:</span> {g.state || '-'}</div>
                      <div><span className="text-gray-400">City:</span> {g.city || '-'}</div>
                      <div><span className="text-gray-400">Home Team:</span> {mobileHomeTeam}</div>
                    </div>
                  </div>
                  );
                })}
                {(!groundList.length) && (
                  <div className="py-8 text-center text-gray-400">No grounds created yet.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Delete Ground?</h3>
              <p className="text-xs text-gray-500 mb-4">Are you sure you want to delete? This action cannot be undone.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">Cancel</button>
                <button onClick={() => { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); }} disabled={deleteMutation.isPending} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">
                  {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <h3 className="text-base font-bold text-gray-800 mb-1">Discard Changes?</h3>
              <p className="text-xs text-gray-500 mb-4">Are you sure you want to cancel? Any unsaved changes will be lost.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">No, Keep Editing</button>
                <button onClick={confirmCancel} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Yes, Discard</button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

// -- CREATE TROPHY TAB --
interface TrophyGroup {
  name: string;
  teamIds: string[];
}

function CreateTrophyTab({ boardId, onClose, editTournamentId }: { boardId: string; onClose?: () => void; editTournamentId?: string | null }) {
  const isEditMode = !!editTournamentId;
  const [name, setName] = useState('');
  const [winPoints, setWinPoints] = useState('2');
  const [umpireOption, setUmpireOption] = useState<'list' | 'buddy'>('list');
  const [groups, setGroups] = useState<TrophyGroup[]>([{ name: '', teamIds: [] }]);
  const [teamSearches, setTeamSearches] = useState<string[]>(['']);
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const dropdownTriggerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [duplicateNameError, setDuplicateNameError] = useState('');
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  /** Normalize a tournament name for comparison: trim, collapse internal spaces, lowercase */
  const normalizeName = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase();

  /** Check if a tournament name already exists */
  const isDuplicateName = (val: string): boolean => {
    const normalized = normalizeName(val);
    if (!normalized) return false;
    return existingTournamentList.some((t: any) => {
      // In edit mode, exclude the current tournament (API may use id or tournamentId)
      const tid = t.id || t.tournamentId;
      if (isEditMode && tid === editTournamentId) return false;
      const tName = normalizeName(t.tournamentName || t.name || '');
      return tName === normalized;
    });
  };

  // Fetch tournament details when in edit mode
  useEffect(() => {
    if (!editTournamentId) return;
    setEditLoading(true);
    tournamentService.getTournamentById(editTournamentId).then(res => {
      const d = res.data as any;
      setName(d.name || d.tournamentName || '');
      setWinPoints(String(d.winPoints ?? d.winPoint ?? 2));
      const allowList = d.allowUmpireFromList ?? true;
      const allowBuddy = d.allowBuddyAsUmpire ?? false;
      setUmpireOption(allowBuddy ? 'buddy' : 'list');
      const rawGroups = d.groups || d.groupList || [];
      if (Array.isArray(rawGroups) && rawGroups.length > 0) {
        const parsed = rawGroups.map((g: any) => {
          const rawTeams = g.teamBoardIds || g.teams || g.teamBoardId || [];
          let teamIds: string[] = [];
          if (Array.isArray(rawTeams)) {
            teamIds = rawTeams.map((item: any) => typeof item === 'string' ? item : item?.teamBoardId || item?.boardId || item?.id || '').filter(Boolean);
          }
          return { name: g.name || g.tournamentGroupName || '', teamIds };
        });
        setGroups(parsed);
        setTeamSearches(parsed.map(() => ''));
      }
    }).catch(err => {
      console.error('[EditTournament] Fetch error:', err);
      setErrorMsg('Failed to load tournament details.');
    }).finally(() => setEditLoading(false));
  }, [editTournamentId]);

  // Fetch existing tournaments for duplicate name validation
  const { data: existingTournaments, isPending: tournamentsPending } = useQuery({
    queryKey: ['umpireTournaments', boardId],
    queryFn: async () => {
      const r = await tournamentService.getTournaments(boardId, 1, 100);
      const d = r.data as any;
      return Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
    },
    refetchOnMount: 'always',
  });
  const existingTournamentList = Array.isArray(existingTournaments) ? existingTournaments : [];

  // Load Team Boards for this league from GET /Boards/teamboards/league/{leagueBoardId}
  const [teamBoardError, setTeamBoardError] = useState('');
  const { data: boardsList, isLoading: boardsLoading, refetch: refetchBoards } = useQuery({
    queryKey: ['teamBoards', boardId],
    queryFn: async () => {
      try {
        setTeamBoardError('');
        const res = await boardService.getTeamBoardsByLeague(boardId, 1, 50);
        const raw = res.data as any;
        console.log('[TeamBoards] API response:', raw);
        const items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? (Array.isArray(raw?.result) ? raw.result : []));
        const list = Array.isArray(items) ? items : [];
        console.log('[TeamBoards] Parsed items:', list.length);
        return list.map((b: any) => ({
          id: b.id || b.Id || b.boardId || '',
          name: b.name || b.boardName || b.Name || '',
          logoUrl: b.logoUrl || '',
          description: b.description || b.city || '',
        }));
      } catch (err) {
        console.error('[TeamBoards] API error:', err);
        setTeamBoardError('Failed to load Team Boards. Please try again.');
        throw err;
      }
    },
    enabled: !!boardId,
    staleTime: 60000,
    retry: 1,
  });

  const buildPayload = () => ({
    name: name,
    winPoints: Number(winPoints) || 0,
    allowUmpireFromList: umpireOption === 'list',
    allowBuddyAsUmpire: umpireOption === 'buddy',
    groups: groups.map((g, idx) => ({
      name: g.name,
      sortOrder: idx,
      teamBoardIds: g.teamIds,
    })),
  });

  const createMutation = useMutation({
    mutationFn: () => tournamentService.createTournament(boardId, buildPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments', boardId] });
      qc.invalidateQueries({ queryKey: ['umpireTournaments'] });
      setName(''); setWinPoints('2'); setGroups([{ name: '', teamIds: [] }]); setTeamSearches(['']);
      setSuccessMsg('Tournament created successfully!');
      setErrorMsg('');
      setDuplicateNameError('');
      if (onClose) onClose();
      setTimeout(() => { setSuccessMsg(''); }, 4000);
    },
    onError: (err: any) => {
      const respData = err?.response?.data;
      let msg = typeof respData === 'string' ? respData : respData?.message || respData?.title || respData?.detail || '';
      if (respData?.errors) {
        const ve = Object.entries(respData.errors).map(([f, e]) => `${f}: ${Array.isArray(e) ? e.join(', ') : e}`).join('; ');
        msg = msg ? `${msg} ? ${ve}` : ve;
      }
      setErrorMsg(msg || err?.message || 'Failed to create tournament. Please try again.');
      setSuccessMsg('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => tournamentService.updateTournament(editTournamentId!, buildPayload()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments', boardId] });
      qc.invalidateQueries({ queryKey: ['umpireTournaments'] });
      setSuccessMsg('Tournament updated successfully!');
      setErrorMsg('');
      setDuplicateNameError('');
      setTimeout(() => { setSuccessMsg(''); if (onClose) onClose(); }, 4000);
    },
    onError: (err: any) => {
      const respData = err?.response?.data;
      let msg = typeof respData === 'string' ? respData : respData?.message || respData?.title || respData?.detail || '';
      if (respData?.errors) {
        const ve = Object.entries(respData.errors).map(([f, e]) => `${f}: ${Array.isArray(e) ? e.join(', ') : e}`).join('; ');
        msg = msg ? `${msg} ? ${ve}` : ve;
      }
      setErrorMsg(msg || err?.message || 'Failed to update tournament. Please try again.');
      setSuccessMsg('');
    },
  });

  const saveMutation = isEditMode ? updateMutation : createMutation;

  const addGroup = () => {
    setGroups([...groups, { name: '', teamIds: [] }]);
    setTeamSearches([...teamSearches, '']);
    // New group should be expanded (not in collapsed set) ? no action needed since new index is not in the set
  };

  const removeGroup = (idx: number) => {
    setGroups(groups.filter((_, i) => i !== idx));
    setTeamSearches(teamSearches.filter((_, i) => i !== idx));
    // Shift collapsed indices to match the new group positions
    setCollapsedGroups(prev => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
        // i === idx is the removed group, skip it
      }
      return next;
    });
  };

  const updateGroupName = (idx: number, val: string) => {
    const updated = [...groups];
    updated[idx] = { ...updated[idx], name: sanitizeTextInput(val) };
    setGroups(updated);
  };

  const [duplicateTeamErrors, setDuplicateTeamErrors] = useState<Record<number, string>>({});

  const addTeamToGroup = (groupIdx: number, teamId: string) => {
    const updated = [...groups];
    if (!updated[groupIdx].teamIds.includes(teamId)) {
      // Check if this team is already selected in another group
      const otherGroupIdx = updated.findIndex((g, i) => i !== groupIdx && g.teamIds.includes(teamId));
      if (otherGroupIdx !== -1) {
        setDuplicateTeamErrors(prev => ({ ...prev, [groupIdx]: 'Team Board must be unique' }));
        const searches = [...teamSearches];
        searches[groupIdx] = '';
        setTeamSearches(searches);
        return;
      }
      setDuplicateTeamErrors(prev => { const next = { ...prev }; delete next[groupIdx]; return next; });
      updated[groupIdx] = { ...updated[groupIdx], teamIds: [...updated[groupIdx].teamIds, teamId] };
      setGroups(updated);
    }
    const searches = [...teamSearches];
    searches[groupIdx] = '';
    setTeamSearches(searches);
  };

  const removeTeamFromGroup = (groupIdx: number, teamId: string) => {
    const updated = [...groups];
    updated[groupIdx] = { ...updated[groupIdx], teamIds: updated[groupIdx].teamIds.filter(t => t !== teamId) };
    setGroups(updated);
    setDuplicateTeamErrors(prev => { const next = { ...prev }; delete next[groupIdx]; return next; });
  };

  const getFilteredBoards = (groupIdx: number) => {
    const search = teamSearches[groupIdx]?.toLowerCase() || '';
    const selectedInOtherGroups = groups.flatMap((g, i) => i !== groupIdx ? g.teamIds : []);
    return (boardsList || []).filter((b: any) =>
      !selectedInOtherGroups.includes(b.id) &&
      (!search || b.name.toLowerCase().includes(search))
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-lg shadow-sm">
        <div className="bg-gray-100 px-6 py-3 border-b">
          <h2 className="text-base font-bold text-gray-800">{isEditMode ? 'Edit Tournament' : 'Group Tournament'}</h2>
        </div>

        {editLoading ? (
          <div className="p-6 flex items-center justify-center py-12"><div className="w-8 h-8 border-4 border-brand-green border-t-transparent rounded-full animate-spin" /></div>
        ) : (
        <div className="p-6 space-y-6">
          {/* Tournament Name + Win Points */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Tournament Name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={e => {
                  const val = sanitizeTextInput(e.target.value);
                  setName(val);
                  if (isDuplicateName(val)) {
                    setDuplicateNameError('A Tournament with this name already exists. Please use a different name.');
                  } else {
                    setDuplicateNameError('');
                  }
                }}
                onBlur={() => {
                  if (isDuplicateName(name)) {
                    setDuplicateNameError('A Tournament with this name already exists. Please use a different name.');
                  } else {
                    setDuplicateNameError('');
                  }
                }}
                className={`input-field${duplicateNameError ? ' border-red-500' : ''}`}
              />
              {duplicateNameError && (
                <p className="text-red-500 text-xs mt-1">{duplicateNameError}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1">
                Win Points for the Match <span className="text-red-500">*</span>
              </label>
              <select
                value={winPoints}
                onChange={e => setWinPoints(e.target.value)}
                className="input-field"
              >
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Groups */}
          <div className="space-y-4">
            {groups.map((group, gIdx) => (
              <div key={gIdx} className="border-2 border-red-500 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCollapsedGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(gIdx)) next.delete(gIdx); else next.add(gIdx);
                    return next;
                  })}
                  className="w-full bg-red-600 text-white px-4 py-2 flex items-center justify-between cursor-pointer rounded-t-md"
                >
                  <span className="font-bold text-sm uppercase">{group.name || '\u00A0'}</span>
                  <div className="flex items-center gap-2">
                    {groups.length > 1 && (
                      <span onClick={(e) => { e.stopPropagation(); removeGroup(gIdx); }} className="text-white hover:text-red-200 cursor-pointer" title="Remove group">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </span>
                    )}
                    <svg className={`w-4 h-4 transition-transform duration-200 ${collapsedGroups.has(gIdx) ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {!collapsedGroups.has(gIdx) && (
                <div className="p-4 space-y-4">
                  {/* Group Name  -  full width */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Group Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={group.name}
                      onChange={e => updateGroupName(gIdx, e.target.value)}
                      className="input-field w-full"
                    />
                  </div>

                  {/* Team slots  -  fixed dropdown row + chips row below */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Team Board <span className="text-red-500">*</span>
                    </label>
                    {duplicateTeamErrors[gIdx] && (
                      <p className="text-red-500 text-xs mb-2">{duplicateTeamErrors[gIdx]}</p>
                    )}

                    {/* Select Team dropdown  -  always fixed at top, never moves */}
                    <div className="relative w-44 mb-3"
                      ref={el => { dropdownTriggerRefs.current[gIdx] = el; }}
                    >
                      <div
                        className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg cursor-pointer flex items-center justify-between bg-gray-50 hover:border-brand-green hover:bg-brand-green/5 transition-colors"
                        onClick={() => {
                          if (openDropdown === gIdx) {
                            setOpenDropdown(null);
                            setDropdownPos(null);
                          } else {
                            const el = dropdownTriggerRefs.current[gIdx];
                            if (el) {
                              const rect = el.getBoundingClientRect();
                              setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX, width: Math.max(rect.width, 224) });
                            }
                            setOpenDropdown(gIdx);
                            refetchBoards();
                          }
                        }}
                      >
                        <span className="text-gray-400 text-sm truncate">Select Team</span>
                        <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-1 ${openDropdown === gIdx ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Portal dropdown  -  renders at body level to escape overflow:hidden */}
                    {openDropdown === gIdx && dropdownPos && ReactDOM.createPortal(
                      <>
                        <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenDropdown(null); setDropdownPos(null); const s = [...teamSearches]; s[gIdx] = ''; setTeamSearches(s); }} />
                        <div
                          className="absolute z-[9999] bg-white border border-gray-200 rounded-lg shadow-2xl"
                          style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
                        >
                          <div className="p-2 border-b border-gray-100">
                            <input
                              type="text"
                              value={teamSearches[gIdx] || ''}
                              onChange={e => {
                                const searches = [...teamSearches];
                                searches[gIdx] = e.target.value;
                                setTeamSearches(searches);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent"
                              placeholder="Search boards..."
                              autoFocus
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                          {teamBoardError && <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{teamBoardError}</div>}
                          <div className="max-h-60 overflow-y-auto">
                            {boardsLoading ? (
                              <div className="px-4 py-3 text-sm text-gray-500 text-center flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />Loading Team Boards...</div>
                            ) : (() => {
                              const filtered = getFilteredBoards(gIdx);
                              return filtered.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-gray-500 text-center">No Team Boards Available</div>
                              ) : (
                                filtered.map((b: any) => {
                                  const isSelected = groups[gIdx].teamIds.includes(b.id);
                                  return (
                                  <button
                                    key={b.id}
                                    onClick={() => {
                                      if (isSelected) {
                                        removeTeamFromGroup(gIdx, b.id);
                                      } else {
                                        addTeamToGroup(gIdx, b.id);
                                      }
                                    }}
                                    className={`w-full text-left px-4 py-2 flex items-center gap-2 text-sm border-b last:border-0 ${isSelected ? 'bg-brand-green/10' : 'hover:bg-brand-green/5'}`}
                                  >
                                    <div className="w-7 h-7 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs flex-shrink-0">
                                      {b.logoUrl
                                        ? <img src={b.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                                        : b.name?.[0]?.toUpperCase() || '?'
                                      }
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <span className="block font-medium text-gray-900 truncate">{b.name}</span>
                                    </div>
                                    {isSelected && (
                                      <svg className="w-5 h-5 text-brand-green flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </button>
                                  );
                                })
                              );
                            })()}
                          </div>
                        </div>
                      </>,
                      document.body
                    )}

                    {/* Selected team chips  -  separate row, never shifts the dropdown above */}
                    {group.teamIds.length > 0 && (
                      <div className="flex flex-wrap gap-3 items-start mt-1">
                        {group.teamIds.map(tid => {
                          const board = boardsList?.find((b: any) => b.id === tid);
                          return (
                            <div key={tid} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm min-w-[140px] max-w-[180px]">
                              {board?.logoUrl
                                ? <img src={board.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                                : <div className="w-7 h-7 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs flex-shrink-0">{board?.name?.[0]?.toUpperCase() || '?'}</div>
                              }
                              <span className="text-sm font-medium text-gray-800 truncate flex-1">{board?.name || tid}</span>
                              <button
                                onClick={() => removeTeamFromGroup(gIdx, tid)}
                                className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 ml-1"
                                title="Remove team"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            ))}

            <button
              onClick={addGroup}
              className="btn-primary text-sm px-6"
            >
              + Add Group
            </button>
          </div>

          {/* Action Buttons */}
          {successMsg && <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{successMsg}</div>}
          {errorMsg && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{errorMsg}</div>}
          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={() => {
                const hasData = name.trim() || winPoints !== '2' || groups.some(g => g.name.trim() !== '' || g.teamIds.length > 0) || groups.length > 1;
                if (hasData) { setShowCancelConfirm(true); return; }
                if (onClose) onClose();
              }}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setErrorMsg('');
                if (!name.trim()) { setErrorMsg('Tournament Name is mandatory.'); return; }
                // Check for duplicate tournament name via fresh API call
                setCheckingDuplicate(true);
                try {
                  const r = await tournamentService.getTournaments(boardId, 1, 100);
                  const d = r.data as any;
                  const freshList = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
                  const normalized = normalizeName(name);
                  const hasDup = freshList.some((t: any) => {
                    const tid = t.id || t.tournamentId;
                    if (isEditMode && tid === editTournamentId) return false;
                    const tName = normalizeName(t.tournamentName || t.name || '');
                    return tName === normalized;
                  });
                  if (hasDup) {
                    setDuplicateNameError('A Tournament with this name already exists. Please use a different name.');
                    setErrorMsg('A Tournament with this name already exists. Please use a different name.');
                    setCheckingDuplicate(false);
                    return;
                  }
                } catch {
                  // Fallback to cached data if API fails
                  if (isDuplicateName(name)) {
                    setDuplicateNameError('A Tournament with this name already exists. Please use a different name.');
                    setErrorMsg('A Tournament with this name already exists. Please use a different name.');
                    setCheckingDuplicate(false);
                    return;
                  }
                }
                setCheckingDuplicate(false);
                for (let i = 0; i < groups.length; i++) {
                  if (!groups[i].name.trim()) { setErrorMsg(`Group ${String.fromCharCode(65 + i)} must have a name.`); return; }
                  if (groups[i].teamIds.length < 1) { setErrorMsg(`Group ${String.fromCharCode(65 + i)} must have at least one team.`); return; }
                }
                const groupNames = groups.map(g => g.name.trim().toLowerCase());
                const duplicates = groupNames.filter((n, i) => groupNames.indexOf(n) !== i);
                if (duplicates.length > 0) { setErrorMsg('Group names must be different. Please use unique names for each group.'); return; }
                // Check for duplicate Team Boards across groups
                const allTeamIds: string[] = [];
                const dupErrors: Record<number, string> = {};
                for (let i = 0; i < groups.length; i++) {
                  for (const tid of groups[i].teamIds) {
                    if (allTeamIds.includes(tid)) {
                      dupErrors[i] = 'Team Board must be unique';
                      break;
                    }
                    allTeamIds.push(tid);
                  }
                }
                if (Object.keys(dupErrors).length > 0) {
                  setDuplicateTeamErrors(dupErrors);
                  setErrorMsg('Team Board must be unique across all groups.');
                  return;
                }
                setDuplicateTeamErrors({});
                // Check that each group has at least 1 team
                const insufficientGroups = groups.filter(g => g.teamIds.length < 1);
                if (insufficientGroups.length > 0) {
                  setErrorMsg('Each group must have at least 1 Team Board.');
                  return;
                }
                // Total teams across all groups must be at least 2
                const totalTeams = groups.reduce((sum, g) => sum + g.teamIds.length, 0);
                if (totalTeams < 2) {
                  setErrorMsg('At least 2 Team Boards are required across all groups.');
                  return;
                }
                saveMutation.mutate();
              }}
              disabled={saveMutation.isPending || checkingDuplicate || tournamentsPending || !name.trim() || !winPoints.trim() || groups.length < 1 || groups.some(g => !g.name.trim() || g.teamIds.length < 1) || groups.reduce((s, g) => s + g.teamIds.length, 0) < 2 || !!duplicateNameError}
              className="btn-primary text-sm px-6"
            >
              {checkingDuplicate ? 'Checking...' : saveMutation.isPending ? (isEditMode ? 'Updating...' : 'Submitting...') : (isEditMode ? 'Update' : 'Submit')}
            </button>
          </div>


        </div>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Discard Changes?</h3>
              <p className="text-xs text-gray-500 mb-4">You have unsaved changes. Are you sure you want to discard them?</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">No, Keep Editing</button>
                <button onClick={() => { setShowCancelConfirm(false); setName(''); setWinPoints('2'); setGroups([{ name: '', teamIds: [] }]); setTeamSearches(['']); setErrorMsg(''); setSuccessMsg(''); if (onClose) onClose(); }} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Yes, Discard</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- CANCEL GAME BY DATE TAB --
function CancelGameTab({ boardId }: { boardId: string }) {
  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]);
  const [to, setTo] = useState(new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().split('T')[0]);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const qc = useQueryClient();
  const bulkCancelMutation = useMutation({
    mutationFn: () => leagueService.cancelGames(boardId, from, to),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', boardId] });
      qc.invalidateQueries({ queryKey: ['cancelGameSchedule', boardId] });
      qc.invalidateQueries({ queryKey: ['allSchedules', boardId] });
    },
  });

  // Single match cancel mutation using DELETE /Schedules/{id}
  const cancelSingleMutation = useMutation({
    mutationFn: (matchId: string) => {
      console.log('[CancelGame] Deleting schedule with id:', matchId, 'boardId:', boardId);
      return leagueService.deleteSchedule(boardId, matchId);
    },
    onSuccess: () => {
      setCancelConfirmId(null);
      setCancellingId(null);
      qc.invalidateQueries({ queryKey: ['schedule', boardId] });
      qc.invalidateQueries({ queryKey: ['cancelGameSchedule', boardId] });
      qc.invalidateQueries({ queryKey: ['allSchedules', boardId] });
    },
    onError: (err: any) => {
      console.error('[CancelGame] Delete failed:', err?.response?.status, err?.response?.data, err);
      setCancellingId(null);
    },
  });

  // Helper: deeply unwrap $values from .NET JSON responses
  const unwrapCancelValues = (d: any): any[] => {
    if (Array.isArray(d)) return d;
    if (!d || typeof d !== 'object') return [];
    if (Array.isArray(d.$values)) return d.$values;
    if (Array.isArray(d.data?.$values)) return d.data.$values;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.result)) return d.result;
    return [];
  };

  // Fetch matches for the selected date range
  const { data: cancelMatches, isLoading: isLoadingMatches } = useQuery({
    queryKey: ['cancelGameSchedule', boardId, from, to],
    queryFn: () => leagueService.getSchedule(boardId, from, to).then(r => {
      const d = r.data;
      const list = Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? [];
      return list;
    }),
    enabled: !!from && !!to,
  });

  const rawMatchList = Array.isArray(cancelMatches) ? cancelMatches : [];
  if (rawMatchList.length > 0) console.log('[CancelGame] First match keys:', Object.keys(rawMatchList[0]), 'id:', rawMatchList[0].id, 'scheduleId:', rawMatchList[0].scheduleId, 'Id:', rawMatchList[0].Id, 'ScheduleId:', rawMatchList[0].ScheduleId);
  const getMatchId = (m: any): string => m.scheduleId || m.ScheduleId || m.id || m.Id || '';
  const matchList = rawMatchList.filter((m: any) => {
    const d = ensureUtc(m.startAtUtc || m.scheduledAt);
    if (!d || !from || !to) return true;
    const dateStr = d.split('T')[0];
    return dateStr >= from && dateStr <= to;
  }).slice().sort((a: any, b: any) => {
    const dateA = new Date(ensureUtc(a.startAtUtc || a.scheduledAt) || 0).getTime();
    const dateB = new Date(ensureUtc(b.startAtUtc || b.scheduledAt) || 0).getTime();
    return dateB - dateA;
  });

  // Fetch tournaments for name lookup
  const { data: cancelTournaments } = useQuery({
    queryKey: ['umpireTournaments', boardId],
    queryFn: async () => {
      const r = await tournamentService.getTournaments(boardId, 1, 100);
      const d = r.data as any;
      return Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
    },
  });
  const cancelTournamentList = Array.isArray(cancelTournaments) ? cancelTournaments : [];

  // Fetch grounds for name lookup
  const { data: cancelGrounds } = useQuery({
    queryKey: ['grounds', boardId],
    queryFn: () => leagueService.getGrounds(boardId).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d as any)?.data ?? (d as any)?.items ?? [];
    }),
    enabled: !!boardId,
  });
  const cancelGroundList = Array.isArray(cancelGrounds) ? cancelGrounds : [];

  // Fetch umpires for name lookup
  const { data: cancelUmpires } = useQuery({
    queryKey: ['umpires', boardId],
    queryFn: () => leagueService.getUmpires(boardId).then(r => {
      const d = r.data;
      return (Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? []) as Umpire[];
    }),
    enabled: !!boardId,
  });
  const cancelUmpireList = Array.isArray(cancelUmpires) ? cancelUmpires : [];

  // Fetch team boards for name lookup
  const { data: cancelBoardsList } = useQuery({
    queryKey: ['teamBoards'],
    queryFn: async () => {
      const res = await boardService.getByType(1, 1, 50);
      const raw = res.data as any;
      const items = unwrapCancelValues(raw);
      return items.map((b: any) => ({
        id: b.id || b.Id || b.boardId || '',
        name: b.name || b.boardName || b.Name || '',
      }));
    },
    staleTime: 60000,
  });
  const cancelAllBoards = Array.isArray(cancelBoardsList) ? cancelBoardsList : [];

  // Fetch roster name map for team name resolution
  const cancelScheduleTournamentIds = Array.from(new Set(matchList.map((m: any) => m.tournamentId).filter(Boolean))) as string[];
  const { data: cancelRosterNameMap } = useQuery({
    queryKey: ['rosterNameMap', cancelScheduleTournamentIds.join(',')],
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(cancelScheduleTournamentIds.map(async (tid) => {
        try {
          const r = await leagueService.getTeamsByTournament(boardId, tid);
          const d = r.data as any;
          const inner = d?.data || d;
          const rosters = Array.isArray(inner?.rosters) ? inner.rosters
            : Array.isArray(inner?.rosters?.$values) ? inner.rosters.$values
            : Array.isArray(inner?.Rosters) ? inner.Rosters
            : [];
          const teamsboard = Array.isArray(inner?.teamsboard) ? inner.teamsboard
            : Array.isArray(inner?.teamsBoard) ? inner.teamsBoard
            : Array.isArray(inner?.teams) ? inner.teams
            : [];
          const list = rosters.length > 0 ? rosters : teamsboard.length > 0 ? teamsboard : unwrapCancelValues(inner);
          list.forEach((t: any) => {
            const id = t.rosterId || t.RosterId || t.id || t.Id || t.teamId || t.teamBoardId || t.boardId || '';
            const name = t.rosterName || t.RosterName || t.name || t.teamName || t.boardName || t.Name || '';
            if (id && name) map[id] = name;
          });
        } catch { /* skip failed lookups */ }
      }));
      return map;
    },
    enabled: cancelScheduleTournamentIds.length > 0,
    staleTime: 60000,
  });
  const cancelRosterLookup = cancelRosterNameMap || {};

  // Fetch users for scorer name lookup
  const { data: cancelUserList } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const r = await userService.list();
      const raw = r.data as any;
      const list = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.items) ? raw.items
        : Array.isArray(raw?.users) ? raw.users
        : Array.isArray(raw?.result) ? raw.result
        : raw ? [raw] : [];
      return list.map((u: any) => {
        const first = u.firstName || u.name?.split(' ')[0] || u.fullName?.split(' ')[0] || '';
        const last = u.lastName || u.name?.split(' ').slice(1).join(' ') || u.fullName?.split(' ').slice(1).join(' ') || '';
        const email = u.email || u.emailAddress || '';
        return {
          id: u.id || u.Id || u.userId || u.UserId,
          firstName: first || email.split('@')[0] || email,
          lastName: last,
          email,
        };
      });
    },
  });
  const cancelNormalizedUsers = Array.isArray(cancelUserList) ? cancelUserList : [];

  // Lookup helpers
  const clkTournamentName = (m: any) =>
    m.tournamentName || cancelTournamentList.find((t: any) => t.id === m.tournamentId)?.tournamentName || cancelTournamentList.find((t: any) => t.id === m.tournamentId)?.name || '-';
  const clkTeamName = (teamId: string | undefined) => {
    if (!teamId) return '-';
    return cancelRosterLookup[teamId] || cancelAllBoards.find((b: any) => b.id === teamId)?.name || teamId.slice(0, 8) + '...';
  };
  const clkGroundName = (groundId: string | undefined) => {
    if (!groundId) return '-';
    return cancelGroundList.find((g: any) => (g.groundId || g.id) === groundId)?.groundName || cancelGroundList.find((g: any) => (g.groundId || g.id) === groundId)?.name || '-';
  };
  const clkUmpireName = (umpireId: string | undefined) => {
    if (!umpireId) return '-';
    const u = cancelUmpireList.find((u: any) => (u.id || (u as any).umpireId) === umpireId) as any;
    return u?.umpireName || u?.name || '-';
  };
  const clkUserName = (userId: string | undefined) => {
    if (!userId) return '-';
    const u = cancelNormalizedUsers.find((u: any) => u.id === userId);
    return u ? `${u.firstName} ${u.lastName}`.trim() : '-';
  };

  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-lg shadow-sm">
        <div className="bg-gray-100 px-6 py-3 border-b">
          <h2 className="text-base font-bold text-gray-800">Cancel Game by Date</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">From</label><input type="date" value={from} max={to || '9999-12-31'} onChange={e => { const v = e.target.value; if (v && v.length > 10) return; if (v && to && v > to) { setFrom(v); setTo(v); } else { setFrom(v); } }} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">To</label><input type="date" value={to} min={from} max="9999-12-31" onChange={e => { const v = e.target.value; if (v && v.length > 10) return; if (v && from && v < from) { setTo(v); setFrom(v); } else { setTo(v); } }} className="input-field" /></div>
            <button onClick={() => bulkCancelMutation.mutate()} disabled={bulkCancelMutation.isPending || !from || !to}
              className="px-6 py-2 bg-red-600 text-white rounded text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {bulkCancelMutation.isPending ? 'Cancelling...' : 'Cancel Games'}
            </button>
          </div>
        </div>
      </div>

      {/* Match list grid */}
      <div className="card mt-6">
        {isLoadingMatches ? (
          <div className="py-8 text-center text-gray-400">Loading matches...</div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead><tr className="text-white text-left font-bold text-sm" style={{backgroundColor: '#8091A5'}}><th className="py-3 px-4 rounded-tl-lg w-[5%]"></th><th className="py-3 px-4 w-[13%]">Tournament</th><th className="py-3 px-4 w-[11%]">Home</th><th className="py-3 px-4 w-[11%]">Away</th><th className="py-3 px-4 w-[11%]">Ground</th><th className="py-3 px-4 w-[11%]">Umpire</th><th className="py-3 px-4 w-[13%]">App Scorer</th><th className="py-3 px-4 rounded-tr-lg w-[16%]">Date</th></tr></thead>
            <tbody>
              {matchList.map((m: any) => {
                const mId = getMatchId(m);
                const matchDate = new Date(ensureUtc(m.startAtUtc || m.scheduledAt));
                const isFuture = matchDate.getTime() > Date.now();
                return (
                <tr key={mId} className={`border-b last:border-b-0 ${isFuture ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-60'}`}>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={cancelConfirmId === mId}
                      disabled={!isFuture}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCancelConfirmId(mId);
                        } else {
                          setCancelConfirmId(null);
                        }
                      }}
                      className={`w-4 h-4 accent-red-600 ${isFuture ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                      title={isFuture ? 'Select to cancel' : 'Past matches cannot be cancelled'}
                    />
                  </td>
                  <td className="py-3 px-4 truncate">{clkTournamentName(m)}</td>
                  <td className="py-3 px-4 truncate">{m.homeTeamName || clkTeamName(m.homeTeamId || m.homeTeamBoardId)}</td>
                  <td className="py-3 px-4 truncate">{m.awayTeamName || clkTeamName(m.awayTeamId || m.awayTeamBoardId)}</td>
                  <td className="py-3 px-4 truncate">{m.groundName || clkGroundName(m.groundId)}</td>
                  <td className="py-3 px-4 truncate">{m.umpireName || clkUmpireName(m.umpireId)}</td>
                  <td className="py-3 px-4 truncate">{m.scorerName || clkUserName(m.appScorerId) || '-'}</td>
                  <td className="py-3 px-4 truncate">{formatDateTime(ensureUtc(m.startAtUtc || m.scheduledAt))}</td>
                </tr>
              ); })}
              {(!matchList.length) && <tr><td colSpan={8} className="py-8 text-center text-gray-400">No matches in selected date range.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Cancel Confirmation Modal */}
      {cancelConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!cancellingId) setCancelConfirmId(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Cancel Game?</h3>
              <p className="text-xs text-gray-500 mb-4">Are you sure you want to cancel this game? This action cannot be undone.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setCancelConfirmId(null)} disabled={!!cancellingId} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm disabled:opacity-50">No</button>
                <button
                  onClick={() => {
                    setCancellingId(cancelConfirmId);
                    cancelSingleMutation.mutate(cancelConfirmId);
                  }}
                  disabled={!!cancellingId}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm disabled:opacity-50"
                >
                  {cancellingId === cancelConfirmId ? 'Cancelling...' : 'Yes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- TOURNAMENT VIEW DETAIL (fetches full detail including groups & teams) --
function TournamentViewDetail({ tournamentId, boardId, onClose }: { tournamentId: string; boardId: string; onClose: () => void }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['tournamentDetail', tournamentId],
    queryFn: async () => {
      const res = await tournamentService.getTournamentById(tournamentId);
      return res.data as any;
    },
    enabled: !!tournamentId,
  });

  // Fetch team boards for this league to resolve team names
  const { data: teamBoards } = useQuery({
    queryKey: ['teamBoards', boardId],
    queryFn: async () => {
      const res = await boardService.getTeamBoardsByLeague(boardId, 1, 100);
      const raw = res.data as any;
      const items = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? (Array.isArray(raw?.result) ? raw.result : []));
      return (Array.isArray(items) ? items : []).map((b: any) => ({
        id: b.id || b.Id || b.boardId || '',
        name: b.name || b.boardName || b.Name || '',
        logoUrl: b.logoUrl || '',
      }));
    },
  });

  const resolveTeamName = (teamId: string) => {
    const team = (teamBoards || []).find((b: any) => b.id === teamId);
    return team?.name || teamId;
  };

  const resolveTeamLogo = (teamId: string) => {
    const team = (teamBoards || []).find((b: any) => b.id === teamId);
    return team?.logoUrl || '';
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm mb-6 p-6">
        <div className="py-8 text-center text-gray-400">Loading tournament details...</div>
      </div>
    );
  }

  if (!detail) return null;

  console.log('[TournamentViewDetail] detail:', JSON.stringify(detail, null, 2));

  const rawGroups = detail.groups || detail.groupList || [];
  const parsedGroups = Array.isArray(rawGroups) ? rawGroups : (rawGroups?.$values && Array.isArray(rawGroups.$values) ? rawGroups.$values : []);

  return (
    <div className="bg-white rounded-lg shadow-sm mb-6">
      <div className="bg-gray-100 px-6 py-3 border-b">
        <h2 className="text-base font-bold text-gray-800">View Tournament</h2>
      </div>
      <div className="p-6">
        {/* Basic info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tournament Name</label>
            <input value={detail.name || detail.tournamentName || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Win Points</label>
            <input value={String(detail.winPoints ?? detail.winPoint ?? '-')} readOnly className="input-field bg-gray-100 cursor-default" />
          </div>
        </div>

        {/* Groups & Teams */}
        {parsedGroups.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-800 mb-3">Groups</h3>
            <div className="space-y-4">
              {parsedGroups.map((g: any, idx: number) => {
                const rawTeams = g.teamBoardIds || g.teams || g.teamBoardId || [];
                let teamIds: string[] = [];
                if (Array.isArray(rawTeams)) {
                  teamIds = rawTeams.map((item: any) => typeof item === 'string' ? item : item?.teamBoardId || item?.boardId || item?.id || '').filter(Boolean);
                } else if (rawTeams?.$values && Array.isArray(rawTeams.$values)) {
                  teamIds = rawTeams.$values.map((item: any) => typeof item === 'string' ? item : item?.teamBoardId || item?.boardId || item?.id || '').filter(Boolean);
                }

                return (
                  <div key={idx} className="border border-gray-400 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2.5 border-b border-gray-400">
                      <p className="text-sm font-semibold text-gray-800">{g.name || g.tournamentGroupName || `Group ${idx + 1}`}</p>
                    </div>
                    <div className="p-4">
                      {teamIds.length > 0 ? (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">Teams</label>
                          <div className="flex flex-wrap gap-2">
                            {teamIds.map((teamId: string) => {
                              const logo = resolveTeamLogo(teamId);
                              return (
                                <span key={teamId} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 text-xs font-medium px-3 py-1.5 rounded-full">
                                  {logo ? (
                                    <img src={logo} alt="" className="w-4 h-4 rounded-full object-cover" />
                                  ) : (
                                    <span className="w-4 h-4 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-[10px]">
                                      {resolveTeamName(teamId)[0]?.toUpperCase() || '?'}
                                    </span>
                                  )}
                                  {resolveTeamName(teamId)}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400">No teams assigned</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// -- TOURNAMENTS TAB --
function TournamentsTab({ boardId, onDirtyChange }: { boardId: string; onDirtyChange?: (dirty: boolean) => void }) {
  const qc = useQueryClient();
  const [showCreate, _setShowCreateTournament] = useState(() => sessionStorage.getItem('tournament_mode') === 'create');
  const setShowCreate = (v: boolean) => { _setShowCreateTournament(v); if (v) sessionStorage.setItem('tournament_mode', 'create'); else sessionStorage.removeItem('tournament_mode'); };
  const [editId, _setEditId] = useState<string | null>(() => sessionStorage.getItem('tournamentEditId') || null);
  const setEditId = (id: string | null) => { _setEditId(id); if (id) sessionStorage.setItem('tournamentEditId', id); else sessionStorage.removeItem('tournamentEditId'); };
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  useEffect(() => { onDirtyChange?.(showCreate || !!editId); }, [showCreate, editId]);

  // Fetch tournaments from GET /api/v1/tournament/boards/{boardId}/tournaments (umpireApi)
  const { data: tournaments, isLoading, isFetching } = useQuery({
    queryKey: ['umpireTournaments', boardId],
    queryFn: async () => {
      const r = await tournamentService.getTournaments(boardId, 1, 100);
      const d = r.data as any;
      const list = Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
      return list;
    },
  });
  const tournamentList = (Array.isArray(tournaments) ? tournaments : []).slice().sort((a: any, b: any) => {
    const nameA = (a.tournamentName || a.name || '').toLowerCase();
    const nameB = (b.tournamentName || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tournamentService.deleteTournament(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['umpireTournaments'] });
      setUpdateSuccess('Tournament deleted successfully!');
      setTimeout(() => setUpdateSuccess(''), 4000);
    },
    onError: (err: any) => setUpdateError(err?.response?.data?.message || err?.message || 'Failed to delete tournament.'),
  });

  const handleEdit = (t: any) => {
    setEditId(t.id);
    setUpdateError('');
    setUpdateSuccess('');
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Tournament List</h2>
        {!showCreate && !editId && (
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-2">
            <span className="text-xl font-bold leading-none">+</span> Create Tournament
          </button>
        )}
      </div>

      {showCreate && (
        <div className="mb-6">
          <CreateTrophyTab boardId={boardId} onClose={() => setShowCreate(false)} />
        </div>
      )}

      {!showCreate && editId && (
        <div className="mb-6">
          <CreateTrophyTab boardId={boardId} editTournamentId={editId} onClose={() => { setEditId(null); setUpdateError(''); setUpdateSuccess(''); }} />
        </div>
      )}

      {!showCreate && !editId && (
        <>
      {/* View details (read-only) */}
      {viewId && <TournamentViewDetail tournamentId={viewId} boardId={boardId} onClose={() => setViewId(null)} />}

      {!viewId && (
      <>
      {updateSuccess && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{updateSuccess}</div>}

      <div className="bg-white rounded-lg shadow-sm">
        <div className="bg-gray-100 px-4 sm:px-6 py-3 border-b">
          <h2 className="text-base font-bold text-gray-800">Tournament List</h2>
        </div>
        <div className="p-4 sm:p-6">
          {(isLoading || isFetching) ? (
            <div className="py-8 text-center text-gray-400">Loading tournaments...</div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="text-white text-left font-bold text-sm" style={{backgroundColor: '#8091A5'}}>
                      <th className="py-3 px-4 rounded-tl-lg w-[55%]">Tournament Name</th>
                      <th className="py-3 px-4 w-[33%]">Win Points</th>
                      <th className="py-3 px-4 rounded-tr-lg w-[12%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournamentList.map((t: any) => {
                      const tid = t.id;
                      return (
                        <tr key={tid} className={`border-b last:border-b-0 hover:bg-gray-50 ${editId === tid ? 'bg-blue-50' : ''}`}>
                          <td className="py-3 px-4 font-medium truncate">{t.tournamentName || t.name || '-'}</td>
                          <td className="py-3 px-4">{t.winPoints ?? t.winPoint ?? '-'}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-4">
                              <button onClick={() => { setViewId(tid); setEditId(null); }} className="text-gray-500 hover:text-gray-700" title="View">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </button>
                              <button onClick={() => handleEdit(t)} className="text-blue-500 hover:text-blue-700" title="Edit">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                              </button>
                              <button onClick={() => setDeleteConfirmId(tid)} disabled={deleteMutation.isPending} className="text-red-500 hover:text-red-700" title="Delete">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {(!tournamentList.length) && (
                      <tr><td colSpan={3} className="py-8 text-center text-gray-400">No tournaments created yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile card view */}
              <div className="md:hidden space-y-4">
                {tournamentList.map((t: any) => {
                  const tid = t.id;
                  return (
                    <div key={tid} className={`border rounded-lg p-4 ${editId === tid ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-gray-800">{t.tournamentName || t.name || '-'}</h3>
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setViewId(tid); setEditId(null); }} className="text-gray-500 hover:text-gray-700" title="View">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
                          <button onClick={() => handleEdit(t)} className="text-blue-500 hover:text-blue-700" title="Edit">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                          </button>
                          <button onClick={() => setDeleteConfirmId(tid)} disabled={deleteMutation.isPending} className="text-red-500 hover:text-red-700" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">
                        <div><span className="text-gray-400">Win Points:</span> {t.winPoints ?? t.winPoint ?? '-'}</div>
                      </div>
                    </div>
                  );
                })}
                {(!tournamentList.length) && (
                  <div className="py-8 text-center text-gray-400">No tournaments created yet.</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Delete Tournament?</h3>
              <p className="text-xs text-gray-500 mb-4">Are you sure you want to delete? This action cannot be undone.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">Cancel</button>
                <button onClick={() => { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); }} disabled={deleteMutation.isPending} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">
                  {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

// -- SCHEDULE TAB --
function ScheduleTab({ boardId, onDirtyChange }: { boardId: string; onDirtyChange?: (dirty: boolean) => void }) {
  const today = new Date();
  const user = useAuthStore((s) => s.user);
  const pad = (n: number) => String(n).padStart(2, '0');
  const [from, setFrom] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`);
  const [to, setTo] = useState(() => { const last = new Date(today.getFullYear(), today.getMonth() + 2, 0); return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`; });
  const [editMatchId, setEditMatchId] = useState<string | null>(() => sessionStorage.getItem('schedule_edit_id') || null);
  const [viewMatchId, setViewMatchId] = useState<string | null>(null);
  const [editTournamentId, setEditTournamentId] = useState('');
  const [editGameType, setEditGameType] = useState('');
  const [editHomeTeamId, setEditHomeTeamId] = useState('');
  const [editAwayTeamId, setEditAwayTeamId] = useState('');
  const [editGround, setEditGround] = useState('');
  const [editUmpire, setEditUmpire] = useState('');
  const [editAppScorer, setEditAppScorer] = useState('');
  const [editPortalScorer, setEditPortalScorer] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editError, setEditError] = useState('');
  const [editDuplicateScheduleError, setEditDuplicateScheduleError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [editOriginal, setEditOriginal] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(() => sessionStorage.getItem('schedule_mode') === 'create');
  const [showCreateCancelConfirm, setShowCreateCancelConfirm] = useState(false);

  // SessionStorage helpers for schedule form
  const SS_PREFIX = 'schedule_';
  const ssSet = (key: string, val: string) => { sessionStorage.setItem(SS_PREFIX + key, val); };
  const ssGet = (key: string) => sessionStorage.getItem(SS_PREFIX + key) || '';
  const ssClearAll = () => {
    ['tournamentId', 'gameType', 'homeTeamId', 'awayTeamId', 'groundId', 'umpireId', 'appScorerId', 'portalScorerId', 'startAtUtc'].forEach(k => sessionStorage.removeItem(SS_PREFIX + k));
  };

  const [newTournamentId, setNewTournamentId] = useState(() => ssGet('tournamentId'));
  const [newHomeTeamId, setNewHomeTeamId] = useState(() => ssGet('homeTeamId'));
  const [newAwayTeamId, setNewAwayTeamId] = useState(() => ssGet('awayTeamId'));
  const [newGroundId, setNewGroundId] = useState(() => ssGet('groundId'));
  const [newUmpireId, setNewUmpireId] = useState(() => ssGet('umpireId'));
  const [newAppScorerId, setNewAppScorerId] = useState(() => ssGet('appScorerId'));
  const [newPortalScorerId, setNewPortalScorerId] = useState(() => ssGet('portalScorerId'));
  const [newScheduledAt, setNewScheduledAt] = useState(() => {
    const utc = ssGet('startAtUtc');
    if (!utc) return '';
    try { return toLocalDateTimeStr(new Date(utc)); } catch { return ''; }
  });
  const [newGameType, setNewGameType] = useState(() => ssGet('gameType'));
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [duplicateScheduleError, setDuplicateScheduleError] = useState('');

  // User search state for Umpire, App Scorer, Portal Scorer
  const [umpireSearch, setUmpireSearch] = useState('');
  const [appScorerSearch, setAppScorerSearch] = useState('');
  const [portalScorerSearch, setPortalScorerSearch] = useState('');
  const [showUmpireDropdown, setShowUmpireDropdown] = useState(false);
  const [showAppScorerDropdown, setShowAppScorerDropdown] = useState(false);
  const [showPortalScorerDropdown, setShowPortalScorerDropdown] = useState(false);
  const [selectedUmpire, setSelectedUmpire] = useState<{ id: string; name: string; email?: string } | null>(null);
  const [selectedAppScorer, setSelectedAppScorer] = useState<{ id: string; firstName: string; lastName: string; email: string } | null>(null);
  const [selectedPortalScorer, setSelectedPortalScorer] = useState<{ id: string; firstName: string; lastName: string; email: string } | null>(null);

  // Time picker dropdown state
  const [showHourDropdown, setShowHourDropdown] = useState(false);
  const [showMinuteDropdown, setShowMinuteDropdown] = useState(false);
  const [showEditHourDropdown, setShowEditHourDropdown] = useState(false);
  const [showEditMinuteDropdown, setShowEditMinuteDropdown] = useState(false);

  // Team board search state for Home/Away
  const [homeTeamSearch, setHomeTeamSearch] = useState('');
  const [awayTeamSearch, setAwayTeamSearch] = useState('');
  const [showHomeTeamDropdown, setShowHomeTeamDropdown] = useState(false);
  const [showAwayTeamDropdown, setShowAwayTeamDropdown] = useState(false);
  const [selectedHomeTeam, setSelectedHomeTeam] = useState<{ id: string; name: string } | null>(null);
  const [selectedAwayTeam, setSelectedAwayTeam] = useState<{ id: string; name: string } | null>(null);

  // Edit-form searchable dropdown state
  const [editHomeTeamSearch, setEditHomeTeamSearch] = useState('');
  const [editAwayTeamSearch, setEditAwayTeamSearch] = useState('');
  const [editUmpireSearchText, setEditUmpireSearchText] = useState('');
  const [editAppScorerSearch, setEditAppScorerSearch] = useState('');
  const [editPortalScorerSearch, setEditPortalScorerSearch] = useState('');
  const [showEditHomeTeamDropdown, setShowEditHomeTeamDropdown] = useState(false);
  const [showEditAwayTeamDropdown, setShowEditAwayTeamDropdown] = useState(false);
  const [showEditUmpireDropdown, setShowEditUmpireDropdown] = useState(false);
  const [showEditAppScorerDropdown, setShowEditAppScorerDropdown] = useState(false);
  const [showEditPortalScorerDropdown, setShowEditPortalScorerDropdown] = useState(false);
  const [selectedEditHomeTeam, setSelectedEditHomeTeam] = useState<{ id: string; name: string } | null>(null);
  const [selectedEditAwayTeam, setSelectedEditAwayTeam] = useState<{ id: string; name: string } | null>(null);
  const [selectedEditUmpire, setSelectedEditUmpire] = useState<{ id: string; name: string; email?: string } | null>(null);
  const [selectedEditAppScorer, setSelectedEditAppScorer] = useState<{ id: string; firstName: string; lastName: string; email: string } | null>(null);
  const [selectedEditPortalScorer, setSelectedEditPortalScorer] = useState<{ id: string; firstName: string; lastName: string; email: string } | null>(null);

  useEffect(() => { onDirtyChange?.(showCreate || !!editMatchId); }, [showCreate, editMatchId]);

  const qc = useQueryClient();

  // Fetch game types from API
  const { data: gameTypeOptions } = useQuery({
    queryKey: ['gameTypes', boardId],
    queryFn: async () => {
      const r = await leagueService.getGameTypes(boardId);
      const d = r.data;
      const list = Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? (d as any)?.$values ?? [];
      return list as string[];
    },
  });

  const { data: matches } = useQuery({
    queryKey: ['schedule', boardId, from, to],
    queryFn: () => leagueService.getSchedule(boardId, from, to).then(r => {
      const d = r.data;
      const list = Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? [];
      console.log('?? Schedule GET raw response:', d);
      if (list.length > 0) console.log('?? First schedule item keys:', Object.keys(list[0]), 'values:', list[0]);
      return list;
    }),
    enabled: !!from && !!to,
  });

  // Fetch ALL schedules (wide date range) for duplicate validation
  // Helper: deeply unwrap $values from .NET JSON responses
  const unwrapValues = (d: any): any[] => {
    if (Array.isArray(d)) return d;
    if (!d || typeof d !== 'object') return [];
    if (Array.isArray(d.$values)) return d.$values;
    if (Array.isArray(d.data?.$values)) return d.data.$values;
    if (Array.isArray(d.result?.$values)) return d.result.$values;
    if (Array.isArray(d.items?.$values)) return d.items.$values;
    if (Array.isArray(d.teams?.$values)) return d.teams.$values;
    if (Array.isArray(d.teamBoards?.$values)) return d.teamBoards.$values;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.result)) return d.result;
    if (Array.isArray(d.teams)) return d.teams;
    if (Array.isArray(d.teamBoards)) return d.teamBoards;
    if (Array.isArray(d.rosters)) return d.rosters;
    if (Array.isArray(d.rosters?.$values)) return d.rosters.$values;
    return [];
  };

  /** Convert a Date to local YYYY-MM-DDTHH:MM string for form display */
  const toLocalDateTimeStr = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  const { data: allSchedules } = useQuery({
    queryKey: ['allSchedules', boardId],
    queryFn: () => leagueService.getSchedule(boardId, '2020-01-01', '2030-12-31').then(r => {
      const d = r.data;
      return unwrapValues(d);
    }),
    enabled: !!boardId,
    staleTime: 30000,
    refetchOnMount: 'always',
  });
  const allMatchList = Array.isArray(allSchedules) ? allSchedules : [];

  /** Check if a schedule with the same Date & Time, Ground, Home Team, and Away Team already exists */
  const toMinuteKey = (d: string | Date): string => { try { return new Date(d).toISOString().slice(0, 16); } catch { return ''; } };
  /** Compare by local date + time for umpire conflict (same local date & time = conflict) */
  const toLocalMinuteKey = (d: string | Date): string => { try { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}T${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`; } catch { return ''; } };
  /** Compare by local date only for umpire conflict (same date = conflict, regardless of time) */
  const toLocalDateKey = (d: string | Date): string => { try { const dt = new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; } catch { return ''; } };
  const getHomeId = (m: any): string => m.homeTeamId || m.homeTeamBoardId || m.HomeTeamId || m.HomeTeamBoardId || '';
  const getAwayId = (m: any): string => m.awayTeamId || m.awayTeamBoardId || m.AwayTeamId || m.AwayTeamBoardId || '';
  const getGroundId = (m: any): string => m.groundId || m.GroundId || '';
  const getSchedDate = (m: any): string => ensureUtc(m.startAtUtc || m.StartAtUtc || m.startAtUTC || m.startatutc || m.scheduledAt || m.ScheduledAt || '');
  const getMatchUmpire = (m: any): string => m.umpireId || m.UmpireId || m.umpireid || m.Umpireid || '';
  const checkDuplicateSchedule = (scheduledAt: string, groundId: string, homeTeamId: string, awayTeamId: string, excludeMatchId?: string | null): string => {
    if (!scheduledAt || !homeTeamId || !awayTeamId) return '';
    const newKey = toMinuteKey(scheduledAt);
    if (!newKey) return '';
    console.log('[DupCheck] Checking against', allMatchList.length, 'schedules. newKey:', newKey, 'groundId:', groundId, 'homeTeamId:', homeTeamId, 'awayTeamId:', awayTeamId);
    const dup = allMatchList.find((m: any) => {
      if (excludeMatchId && (m.id || m.scheduleId || m.Id || m.ScheduleId) === excludeMatchId) return false;
      const mKey = toMinuteKey(getSchedDate(m));
      const mGround = getGroundId(m);
      const mHome = getHomeId(m);
      const mAway = getAwayId(m);
      const match = mKey === newKey && mGround === groundId && mHome === homeTeamId && mAway === awayTeamId;
      if (mHome === homeTeamId || mAway === awayTeamId) {
        console.log('[DupCheck] Candidate:', { mKey, mGround, mHome, mAway, match });
      }
      return match;
    });
    return dup ? 'A schedule with the same Date & Time, Ground, Home Team, and Away Team already exists. Duplicate entries are not allowed.' : '';
  };

  // Fetch tournaments from umpire API (has groupList with teamBoardId)
  const { data: umpireTournaments } = useQuery({
    queryKey: ['umpireTournaments', boardId],
    queryFn: async () => {
      const r = await tournamentService.getTournaments(boardId, 1, 100);
      const d = r.data as any;
      return Array.isArray(d) ? d : d?.items ?? d?.data ?? [];
    },
  });
  const tournamentList = (Array.isArray(umpireTournaments) ? umpireTournaments : []).slice().sort((a: any, b: any) => {
    const nameA = (a.tournamentName || a.name || '').toLowerCase();
    const nameB = (b.tournamentName || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const mapTeamItem = (t: any) => ({
    id: t.rosterId || t.RosterId || t.id || t.Id || t.teamId || t.TeamId || t.teamBoardId || t.TeamBoardId || t.boardId || t.BoardId || '',
    name: t.rosterName || t.RosterName || t.name || t.teamName || t.TeamName || t.boardName || t.BoardName || t.Name || '',
    logoUrl: t.logoUrl || t.logo || '',
  });

  // Load Team Boards from GET /Boards/bytype/1 (boardType=1 = Team Boards)
  const { data: boardsList } = useQuery({
    queryKey: ['teamBoards'],
    queryFn: async () => {
      const res = await boardService.getByType(1, 1, 50);
      const raw = res.data as any;
      console.log('[TeamBoards-Schedule] raw response:', raw);
      const items = unwrapValues(raw);
      console.log('[TeamBoards-Schedule] unwrapped items:', items.length, items.slice(0, 2));
      return items.map((b: any) => ({
        id: b.id || b.Id || b.boardId || '',
        name: b.name || b.boardName || b.Name || '',
        logoUrl: b.logoUrl || '',
      }));
    },
    staleTime: 60000,
  });
  const allBoards = Array.isArray(boardsList) ? boardsList : [];

  // Fetch teams for the selected tournament via Schedules dropdown API
  // API: GET /tournament/Schedules/dropdowns/{tournamentId}/teams
  const { data: tournamentTeams, isLoading: tournamentTeamsLoading } = useQuery({
    queryKey: ['tournamentTeams', newTournamentId],
    queryFn: async () => {
      const r = await leagueService.getTeamsByTournament(boardId, newTournamentId);
      const d = r.data as any;
      console.log('?? Tournament teams raw response:', JSON.stringify(d, null, 2));
      // Try multiple response shapes from the API
      const inner = d?.data || d;
      // Look for rosters array first (API returns rosterId/rosterName)
      const rosters = Array.isArray(inner?.rosters) ? inner.rosters
        : Array.isArray(inner?.rosters?.$values) ? inner.rosters.$values
        : Array.isArray(inner?.Rosters) ? inner.Rosters
        : [];
      const teamsboard = Array.isArray(inner?.teamsboard) ? inner.teamsboard
        : Array.isArray(inner?.teamsBoard) ? inner.teamsBoard
        : Array.isArray(inner?.TeamsBoard) ? inner.TeamsBoard
        : Array.isArray(inner?.teams) ? inner.teams
        : Array.isArray(inner?.Teams) ? inner.Teams
        : [];
      // Prefer rosters, then teamsboard, then generic unwrap
      const list = rosters.length > 0 ? rosters : teamsboard.length > 0 ? teamsboard : unwrapValues(inner);
      console.log('?? Tournament teams extracted:', list.length, list.slice(0, 3));
      const mapped = list.map(mapTeamItem);
      console.log('?? Tournament teams mapped:', mapped.length, mapped.slice(0, 3));
      return mapped;
    },
    enabled: !!newTournamentId,
  });
  const tournamentTeamList = Array.isArray(tournamentTeams) ? tournamentTeams : [];

  // Fetch teams for the selected edit tournament
  // API: GET /tournament/Schedules/dropdowns/{tournamentId}/teams
  const { data: editTournamentTeamsData, isLoading: editTournamentTeamsLoading } = useQuery({
    queryKey: ['editTournamentTeams', editTournamentId],
    queryFn: async () => {
      const r = await leagueService.getTeamsByTournament(boardId, editTournamentId);
      const d = r.data as any;
      console.log('?? Edit tournament teams raw response:', JSON.stringify(d, null, 2));
      const inner = d?.data || d;
      const rosters = Array.isArray(inner?.rosters) ? inner.rosters
        : Array.isArray(inner?.rosters?.$values) ? inner.rosters.$values
        : Array.isArray(inner?.Rosters) ? inner.Rosters
        : [];
      const teamsboard = Array.isArray(inner?.teamsboard) ? inner.teamsboard
        : Array.isArray(inner?.teamsBoard) ? inner.teamsBoard
        : Array.isArray(inner?.TeamsBoard) ? inner.TeamsBoard
        : Array.isArray(inner?.teams) ? inner.teams
        : Array.isArray(inner?.Teams) ? inner.Teams
        : [];
      const list = rosters.length > 0 ? rosters : teamsboard.length > 0 ? teamsboard : unwrapValues(inner);
      return list.map(mapTeamItem);
    },
    enabled: !!editTournamentId && !!editMatchId,
  });
  const editTournamentTeamList = Array.isArray(editTournamentTeamsData) ? editTournamentTeamsData : [];

  // Fetch user list for App Scorer / Portal Scorer (also used for table lookups)
  const shouldFetchUsers = true;
  const { data: userList } = useQuery({
    queryKey: ['usersListSchedule'],
    queryFn: async () => {
      const r = await userService.list();
      const raw = r.data as any;
      const list = Array.isArray(raw) ? raw
        : Array.isArray(raw?.data) ? raw.data
        : Array.isArray(raw?.items) ? raw.items
        : Array.isArray(raw?.users) ? raw.users
        : Array.isArray(raw?.result) ? raw.result
        : raw ? [raw] : [];
      return list.map((u: any) => {
        const first = u.firstName || u.name?.split(' ')[0] || u.fullName?.split(' ')[0] || '';
        const last = u.lastName || u.name?.split(' ').slice(1).join(' ') || u.fullName?.split(' ').slice(1).join(' ') || '';
        const email = u.email || u.emailAddress || '';
        return {
          id: u.id || u.Id || u.userId || u.UserId,
          firstName: first || email.split('@')[0] || email,
          lastName: last,
          email,
        };
      });
    },
    enabled: shouldFetchUsers,
  });
  const normalizedUsers = Array.isArray(userList) ? userList : [];

  const { data: grounds } = useQuery({
    queryKey: ['grounds', boardId],
    queryFn: () => leagueService.getGrounds(boardId).then(r => {
      const d = r.data;
      return Array.isArray(d) ? d : (d as any)?.data ?? (d as any)?.items ?? [];
    }),
    enabled: !!boardId,
  });
  const { data: umpires } = useQuery({
    queryKey: ['umpires', boardId],
    queryFn: () => leagueService.getUmpires(boardId).then(r => {
      const d = r.data;
      return (Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? []) as Umpire[];
    }),
    enabled: !!boardId,
  });

  const umpireList = Array.isArray(umpires) ? umpires : [];
  const groundList = (Array.isArray(grounds) ? grounds : []).slice().sort((a: any, b: any) => {
    const nameA = (a.groundName || a.name || '').toLowerCase();
    const nameB = (b.groundName || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  const rawMatchList = Array.isArray(matches) ? matches : [];

  // Client-side date range filter as safety net
  const matchList = rawMatchList.filter((m: any) => {
    const d = ensureUtc(m.startAtUtc || m.scheduledAt);
    if (!d || !from || !to) return true;
    const dateStr = d.split('T')[0];
    return dateStr >= from && dateStr <= to;
  }).slice().sort((a: any, b: any) => {
    const dateA = new Date(ensureUtc(a.startAtUtc || a.scheduledAt) || 0).getTime();
    const dateB = new Date(ensureUtc(b.startAtUtc || b.scheduledAt) || 0).getTime();
    return dateB - dateA;
  });

  // Collect unique tournament IDs from schedule to fetch team names
  const scheduleTournamentIds = Array.from(new Set(matchList.map((m: any) => m.tournamentId).filter(Boolean))) as string[];
  const { data: rosterNameMap } = useQuery({
    queryKey: ['rosterNameMap', scheduleTournamentIds.join(',')],
    queryFn: async () => {
      const map: Record<string, string> = {};
      await Promise.all(scheduleTournamentIds.map(async (tid) => {
        try {
          const r = await leagueService.getTeamsByTournament(boardId, tid);
          const d = r.data as any;
          const inner = d?.data || d;
          const rosters = Array.isArray(inner?.rosters) ? inner.rosters
            : Array.isArray(inner?.rosters?.$values) ? inner.rosters.$values
            : Array.isArray(inner?.Rosters) ? inner.Rosters
            : [];
          const teamsboard = Array.isArray(inner?.teamsboard) ? inner.teamsboard
            : Array.isArray(inner?.teamsBoard) ? inner.teamsBoard
            : Array.isArray(inner?.teams) ? inner.teams
            : [];
          const list = rosters.length > 0 ? rosters : teamsboard.length > 0 ? teamsboard : unwrapValues(inner);
          list.forEach((t: any) => {
            const id = t.rosterId || t.RosterId || t.id || t.Id || t.teamId || t.teamBoardId || t.boardId || '';
            const name = t.rosterName || t.RosterName || t.name || t.teamName || t.boardName || t.Name || '';
            if (id && name) map[id] = name;
          });
        } catch (e) { /* skip failed lookups */ }
      }));
      return map;
    },
    enabled: scheduleTournamentIds.length > 0,
    staleTime: 60000,
  });
  const rosterLookup = rosterNameMap || {};

  // Lookup helpers to resolve IDs to names for the schedule table
  const lookupTournamentName = (m: any) =>
    m.tournamentName || tournamentList.find((t: any) => t.id === m.tournamentId)?.tournamentName || tournamentList.find((t: any) => t.id === m.tournamentId)?.name || '-';
  const lookupTeamName = (teamId: string | undefined) => {
    if (!teamId) return '-';
    return rosterLookup[teamId] || allBoards.find((b: any) => b.id === teamId)?.name || teamId.slice(0, 8) + '...';
  };
  const lookupGroundName = (groundId: string | undefined) => {
    if (!groundId) return '-';
    return groundList.find((g: any) => (g.groundId || g.id) === groundId)?.groundName || groundList.find((g: any) => (g.groundId || g.id) === groundId)?.name || '-';
  };
  const lookupUmpireName = (umpireId: string | undefined) => {
    if (!umpireId) return '-';
    const u = umpireList.find((u: any) => (u.id || (u as any).umpireId) === umpireId) as any;
    return u?.umpireName || u?.name || '-';
  };
  const lookupUserName = (userId: string | undefined) => {
    if (!userId) return '-';
    const u = normalizedUsers.find((u: any) => u.id === userId);
    return u ? `${u.firstName} ${u.lastName}`.trim() : '-';
  };

  // Filter users based on search text
  const filterUsers = (search: string) => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return normalizedUsers.filter((u: any) =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    );
  };

  // Reset teams when tournament changes (skip on initial mount to preserve restored state)
  const tournamentMountRef = useRef(true);
  useEffect(() => {
    if (tournamentMountRef.current) { tournamentMountRef.current = false; return; }
    setNewHomeTeamId('');
    setNewAwayTeamId('');
    setSelectedHomeTeam(null);
    setSelectedAwayTeam(null);
    setHomeTeamSearch('');
    setAwayTeamSearch('');
    setDuplicateScheduleError('');
  }, [newTournamentId]);

  // Auto-fill defaults when form opens
  useEffect(() => {
    if (!showCreate) return;
  }, [showCreate, tournamentList.length]);

  // Restore create form searchable dropdown selections on mount (after page refresh)
  const createRestoredRef = useRef(false);
  useEffect(() => {
    if (createRestoredRef.current || !showCreate) return;
    const hasRestoredIds = !!(newHomeTeamId || newAwayTeamId || newUmpireId || newAppScorerId || newPortalScorerId);
    if (!hasRestoredIds) return;
    // Wait until data is loaded
    if (!tournamentTeamList.length && !allBoards.length) return;
    createRestoredRef.current = true;
    // Restore team selections
    if (newHomeTeamId) {
      const team = tournamentTeamList.find((t: any) => t.id === newHomeTeamId) || allBoards.find((b: any) => b.id === newHomeTeamId);
      if (team) setSelectedHomeTeam({ id: team.id, name: team.name });
    }
    if (newAwayTeamId) {
      const team = tournamentTeamList.find((t: any) => t.id === newAwayTeamId) || allBoards.find((b: any) => b.id === newAwayTeamId);
      if (team) setSelectedAwayTeam({ id: team.id, name: team.name });
    }
    // Restore umpire selection
    if (newUmpireId) {
      const ump = umpireList.find((u: any) => (u.id || u.umpireId) === newUmpireId) as any;
      if (ump) setSelectedUmpire({ id: ump.id || ump.umpireId, name: ump.umpireName || ump.name || '', email: ump.email });
    }
    // Restore scorer selections
    if (newAppScorerId) {
      const u = normalizedUsers.find((u: any) => u.id === newAppScorerId);
      if (u) setSelectedAppScorer({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email });
    }
    if (newPortalScorerId) {
      const u = normalizedUsers.find((u: any) => u.id === newPortalScorerId);
      if (u) setSelectedPortalScorer({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email });
    }
  }, [showCreate, tournamentTeamList.length, allBoards.length, umpireList.length, normalizedUsers.length]);

  // SessionStorage helpers for schedule edit form
  const EDIT_SS_PREFIX = 'schedule_edit_';
  const editSsSet = (key: string, val: string) => { sessionStorage.setItem(EDIT_SS_PREFIX + key, val); };
  const editSsGet = (key: string) => sessionStorage.getItem(EDIT_SS_PREFIX + key) || '';
  const editSsClearAll = () => {
    ['id', 'tournamentId', 'gameType', 'homeTeamId', 'awayTeamId', 'groundId', 'umpireId', 'appScorerId', 'portalScorerId', 'startAtUtc'].forEach(k => sessionStorage.removeItem(EDIT_SS_PREFIX + k));
  };

  const updateMatchMutation = useMutation({
    mutationFn: () => {
      // Store current edit form values to sessionStorage before sending
      const scheduleId = editSsGet('id') || editMatchId!;
      editSsSet('id', scheduleId);
      editSsSet('tournamentId', editTournamentId);
      editSsSet('gameType', editGameType);
      editSsSet('homeTeamId', editHomeTeamId);
      editSsSet('awayTeamId', editAwayTeamId);
      editSsSet('groundId', editGround);
      editSsSet('umpireId', editUmpire);
      editSsSet('appScorerId', editAppScorer);
      editSsSet('portalScorerId', editPortalScorer);
      editSsSet('startAtUtc', editScheduledAt ? new Date(editScheduledAt).toISOString() : '');

      // Build payload from sessionStorage values
      const payload = {
        tournamentId: editSsGet('tournamentId') || null,
        gameType: editSsGet('gameType') || '',
        homeTeamId: editSsGet('homeTeamId') || null,
        awayTeamId: editSsGet('awayTeamId') || null,
        groundId: editSsGet('groundId') || null,
        startAtUtc: editSsGet('startAtUtc') || null,
        umpireId: editSsGet('umpireId') || null,
        appScorerId: editSsGet('appScorerId') || '',
        portalScorerId: editSsGet('portalScorerId') || '',
        active: true,
      };
      console.log('?? Schedule PUT payload (from sessionStorage):', JSON.stringify(payload, null, 2));
      console.log('?? Schedule PUT id:', scheduleId);
      return leagueService.updateSchedule(boardId, scheduleId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', boardId] });
      editSsClearAll();
      sessionStorage.removeItem('schedule_mode');
      setEditMatchId(null);
      setEditError('');
    },
    onError: (error: any) => {
      const respData = error?.response?.data;
      let msg = typeof respData === 'string' ? respData : respData?.message || respData?.title || respData?.detail || '';
      if (respData?.errors) {
        const ve = Object.entries(respData.errors).map(([f, e]) => `${f}: ${Array.isArray(e) ? e.join(', ') : e}`).join('; ');
        msg = msg ? `${msg}  -  ${ve}` : ve;
      }
      setEditError(msg || error?.message || 'Failed to update schedule.');
    },
  });

  const deleteMatchMutation = useMutation({
    mutationFn: (id: string) => leagueService.deleteSchedule(boardId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', boardId] });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      alert(`Failed to delete schedule. ${error?.response?.data?.message || error?.response?.data?.title || error?.message || ''}`);
      setDeleteConfirmId(null);
    },
  });

  const createMatchMutation = useMutation({
    mutationFn: () => {
      // Store current form values to sessionStorage before sending
      ssSet('tournamentId', newTournamentId);
      ssSet('gameType', newGameType);
      ssSet('homeTeamId', newHomeTeamId);
      ssSet('awayTeamId', newAwayTeamId);
      ssSet('groundId', newGroundId);
      ssSet('umpireId', newUmpireId);
      ssSet('appScorerId', newAppScorerId);
      ssSet('portalScorerId', newPortalScorerId);
      ssSet('startAtUtc', newScheduledAt ? new Date(newScheduledAt).toISOString() : new Date().toISOString());

      // Build payload from sessionStorage values
      const payload: Record<string, any> = {
        tournamentId: ssGet('tournamentId') || null,
        gameType: ssGet('gameType') || '',
        homeTeamId: ssGet('homeTeamId') || null,
        awayTeamId: ssGet('awayTeamId') || null,
        groundId: ssGet('groundId') || null,
        startAtUtc: ssGet('startAtUtc'),
        umpireId: ssGet('umpireId') || null,
        appScorerId: ssGet('appScorerId') || null,
        portalScorerId: ssGet('portalScorerId') || null,
        active: true,
      };
      console.log('?? Schedule POST payload (from sessionStorage):', JSON.stringify(payload, null, 2));
      return tournamentService.createSchedule({ boardId, ...payload } as any);
    },
    onSuccess: (response: any) => {
      console.log('? Schedule created successfully:', response?.data);
      qc.invalidateQueries({ queryKey: ['schedule', boardId] });
      qc.invalidateQueries({ queryKey: ['allSchedules', boardId] });
      setCreateError('');
      setCreateSuccess('Schedule created successfully!');
      ssClearAll();
      resetCreateForm();
      setShowCreate(false);
      setTimeout(() => setCreateSuccess(''), 4000);
    },
    onError: (error: any) => {
      const status = error?.response?.status;
      const respData = error?.response?.data;
      console.error('? Schedule creation failed:', status, respData);
      console.error('? Full error response:', JSON.stringify(error?.response?.data, null, 2));
      console.error('? Request config:', JSON.stringify({ url: error?.config?.url, headers: error?.config?.headers, data: error?.config?.data }, null, 2));
      let msg = '';
      if (typeof respData === 'string') {
        msg = respData;
      } else if (respData) {
        msg = respData.message || respData.title || respData.error || respData.detail || '';
        // Show validation errors if present
        if (respData.errors) {
          const validationErrors = Object.entries(respData.errors)
            .map(([field, errs]) => {
              if (Array.isArray(errs)) return `${field}: ${errs.join(', ')}`;
              if (typeof errs === 'string') return `${field}: ${errs}`;
              if (typeof errs === 'object' && errs !== null) return `${field}: ${JSON.stringify(errs)}`;
              return `${field}: ${String(errs)}`;
            })
            .join('; ');
          msg = msg ? `${msg}  -  ${validationErrors}` : validationErrors;
        }
        // Include exception details if server returns them
        if (respData.exceptionMessage || respData.stackTrace || respData.innerException) {
          const extra = respData.exceptionMessage || respData.innerException?.message || '';
          if (extra) msg = msg ? `${msg} | ${extra}` : extra;
        }
      }
      if (!msg) {
        if (status === 500) {
          msg = 'A schedule with these details already exists or the data is invalid';
        } else if (status === 400) {
          msg = 'Invalid schedule data. Please check all required fields.';
        } else if (status === 409) {
          msg = 'A schedule with these details already exists.';
        } else {
          msg = `Request failed (${status || 'unknown'}). Please try again.`;
        }
      }
      setCreateError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      setCreateSuccess('');
    },
  });

  const handleEditMatch = (m: any) => {
    // Store the selected schedule ID in sessionStorage so it persists
    editSsClearAll();
    sessionStorage.setItem('schedule_mode', 'edit');
    editSsSet('id', m.id);
    setEditMatchId(m.id);
    setEditTournamentId(m.tournamentId || '');
    setEditGameType(m.gameType || '');
    setEditHomeTeamId(m.homeTeamId || m.homeTeamBoardId || '');
    setEditAwayTeamId(m.awayTeamId || m.awayTeamBoardId || '');
    setEditGround(m.groundId || '');
    setEditUmpire(m.umpireId || '');
    setEditAppScorer(m.appScorerId || '');
    setEditPortalScorer(m.portalScorerId || '');
    const schedAt = m.startAtUtc ? toLocalDateTimeStr(new Date(ensureUtc(m.startAtUtc))) : m.scheduledAt ? toLocalDateTimeStr(new Date(ensureUtc(m.scheduledAt))) : '';
    setEditScheduledAt(schedAt);
    setEditOriginal({ tournamentId: m.tournamentId || '', gameType: m.gameType || '', homeTeamId: m.homeTeamId || m.homeTeamBoardId || '', awayTeamId: m.awayTeamId || m.awayTeamBoardId || '', ground: m.groundId || '', umpire: m.umpireId || '', appScorer: m.appScorerId || '', portalScorer: m.portalScorerId || '', scheduledAt: schedAt });
    setEditError('');
    setEditDuplicateScheduleError('');
    // Pre-populate searchable dropdown selections
    const homeId = m.homeTeamId || m.homeTeamBoardId;
    const awayId = m.awayTeamId || m.awayTeamBoardId;
    const homeName = m.homeTeamName || rosterLookup[homeId] || allBoards.find((b: any) => b.id === homeId)?.name || '';
    setSelectedEditHomeTeam(homeId ? { id: homeId, name: homeName || homeId } : null);
    const awayName = m.awayTeamName || rosterLookup[awayId] || allBoards.find((b: any) => b.id === awayId)?.name || '';
    setSelectedEditAwayTeam(awayId ? { id: awayId, name: awayName || awayId } : null);
    const ump = umpireList.find((u: any) => (u.id || u.umpireId) === m.umpireId);
    setSelectedEditUmpire(ump ? { id: ump.id || (ump as any).umpireId, name: (ump as any).umpireName || (ump as any).name || '', email: (ump as any).email } : null);
    const appSc = normalizedUsers.find((u: any) => u.id === m.appScorerId);
    setSelectedEditAppScorer(appSc ? { id: appSc.id, firstName: appSc.firstName, lastName: appSc.lastName, email: appSc.email } : null);
    const portalSc = normalizedUsers.find((u: any) => u.id === m.portalScorerId);
    setSelectedEditPortalScorer(portalSc ? { id: portalSc.id, firstName: portalSc.firstName, lastName: portalSc.lastName, email: portalSc.email } : null);
    setEditHomeTeamSearch(''); setEditAwayTeamSearch(''); setEditUmpireSearchText(''); setEditAppScorerSearch(''); setEditPortalScorerSearch('');
    setShowEditHomeTeamDropdown(false); setShowEditAwayTeamDropdown(false); setShowEditUmpireDropdown(false); setShowEditAppScorerDropdown(false); setShowEditPortalScorerDropdown(false);
  };

  // Restore edit form state from sessionStorage on mount (after page refresh)
  const editRestoredRef = useRef(false);
  useEffect(() => {
    if (editRestoredRef.current) return;
    if (!editMatchId) return;
    // If editOriginal is already set, this isn't a fresh mount restore
    if (editOriginal) return;
    // Try to find the match in loaded data
    const m = rawMatchList.find((x: any) => x.id === editMatchId) || allMatchList.find((x: any) => x.id === editMatchId);
    if (m) {
      editRestoredRef.current = true;
      handleEditMatch(m);
    }
  }, [editMatchId, rawMatchList.length, allMatchList.length]);

  const cancelEdit = () => {
    if (editOriginal) {
      const hasChanges = editTournamentId !== editOriginal.tournamentId || editGameType !== editOriginal.gameType || editHomeTeamId !== editOriginal.homeTeamId || editAwayTeamId !== editOriginal.awayTeamId || editGround !== editOriginal.ground || editUmpire !== editOriginal.umpire || editAppScorer !== editOriginal.appScorer || editPortalScorer !== editOriginal.portalScorer || editScheduledAt !== editOriginal.scheduledAt;
      if (hasChanges) { setShowCancelConfirm(true); return; }
    }
    confirmCancelEdit();
  };

  const confirmCancelEdit = () => {
    setShowCancelConfirm(false);
    editSsClearAll();
    sessionStorage.removeItem('schedule_mode');
    setEditMatchId(null);
    setEditTournamentId('');
    setEditGameType('');
    setEditHomeTeamId('');
    setEditAwayTeamId('');
    setEditGround('');
    setEditUmpire('');
    setEditError('');
    setEditDuplicateScheduleError('');
    setEditAppScorer('');
    setEditPortalScorer('');
    setEditScheduledAt('');
    setEditError('');
    setEditOriginal(null);
    // Clear edit searchable dropdown state
    setSelectedEditHomeTeam(null); setSelectedEditAwayTeam(null); setSelectedEditUmpire(null); setSelectedEditAppScorer(null); setSelectedEditPortalScorer(null);
    setEditHomeTeamSearch(''); setEditAwayTeamSearch(''); setEditUmpireSearchText(''); setEditAppScorerSearch(''); setEditPortalScorerSearch('');
    setShowEditHomeTeamDropdown(false); setShowEditAwayTeamDropdown(false); setShowEditUmpireDropdown(false); setShowEditAppScorerDropdown(false); setShowEditPortalScorerDropdown(false);
  };

  const resetCreateForm = () => {
    ssClearAll();
    sessionStorage.removeItem('schedule_mode');
    setNewTournamentId('');
    setNewGameType('');
    setNewHomeTeamId('');
    setNewAwayTeamId('');
    setNewGroundId('');
    setNewUmpireId('');
    setNewAppScorerId('');
    setNewPortalScorerId('');
    setNewScheduledAt('');
    setSelectedHomeTeam(null);
    setSelectedAwayTeam(null);
    setSelectedUmpire(null);
    setSelectedAppScorer(null);
    setSelectedPortalScorer(null);
    setHomeTeamSearch('');
    setAwayTeamSearch('');
    setUmpireSearch('');
    setAppScorerSearch('');
    setPortalScorerSearch('');
    setFormErrors({});
    setDuplicateScheduleError('');
  };

  // Check if all required fields for creating a match are filled
  const isCreateFormValid = !!(newTournamentId && newGameType && newHomeTeamId && newAwayTeamId && newGroundId && newUmpireId && newScheduledAt && newAppScorerId);

  const validateAndCreate = async () => {
    const errors: Record<string, string> = {};
    if (!newTournamentId) errors.tournament = 'Tournament is required';
    if (!newGameType) errors.gameType = 'Game Type is required';
    if (!newHomeTeamId) errors.homeTeam = 'Home Team is required';
    if (!newAwayTeamId) errors.awayTeam = 'Away Team is required';
    if (newHomeTeamId && newAwayTeamId && newHomeTeamId === newAwayTeamId) errors.awayTeam = 'Home and Away teams must be different';
    if (!newGroundId) errors.ground = 'Ground is required';
    if (!newUmpireId) errors.umpire = 'Umpire is required';
    if (!newScheduledAt) errors.scheduledAt = 'Date & Time is required';
    else if (new Date(newScheduledAt) < new Date(new Date().toDateString())) errors.scheduledAt = 'Cannot schedule a match in the past';
    if (!newAppScorerId) errors.appScorer = 'App Scorer is required';
    setFormErrors(errors);
    setCreateError('');
    setCreateSuccess('');
    setDuplicateScheduleError('');
    if (Object.keys(errors).length > 0) return;
    // Check for duplicate schedule (same Date & Time, Ground, Home Team, Away Team) via fresh API call
    try {
      const freshRes = await leagueService.getSchedule(boardId, '2020-01-01', '2030-12-31');
      const freshData = freshRes.data;
      const freshList = unwrapValues(freshData);
      // Also try standard parsing if unwrapValues returns empty
      const effectiveList = freshList.length > 0 ? freshList : (Array.isArray(freshData) ? freshData : (freshData as any)?.items ?? (freshData as any)?.data ?? []);
      console.log('[DupCheck-Submit] freshList length:', effectiveList.length, effectiveList.length > 0 ? 'first item keys:' : '', effectiveList.length > 0 ? Object.keys(effectiveList[0]) : '');
      const newKey = toMinuteKey(newScheduledAt);
      console.log('[DupCheck-Submit] Checking newKey:', newKey, 'groundId:', newGroundId, 'homeTeamId:', newHomeTeamId, 'awayTeamId:', newAwayTeamId);
      const dup = effectiveList.find((m: any) => {
        const mKey = toMinuteKey(getSchedDate(m));
        const mGround = getGroundId(m);
        const mHome = getHomeId(m);
        const mAway = getAwayId(m);
        return mKey === newKey && mGround === newGroundId && mHome === newHomeTeamId && mAway === newAwayTeamId;
      });
      if (dup) {
        const dupMsg = 'A schedule with the same Date & Time, Ground, Home Team, and Away Team already exists. Duplicate entries are not allowed.';
        setDuplicateScheduleError(dupMsg);
        return;
      }
      // Check umpire conflict: same umpire on the same date
      const newUmpireKey = toLocalDateKey(newScheduledAt);
      console.log('[UmpireConflict] newUmpireKey:', newUmpireKey, 'newUmpireId:', newUmpireId, 'list count:', effectiveList.length);
      effectiveList.forEach((m: any, i: number) => {
        const mKey = toLocalDateKey(getSchedDate(m));
        const mUmpire = getMatchUmpire(m);
        if (mUmpire === newUmpireId) console.log(`[UmpireConflict] Match ${i}: mKey=${mKey} mUmpire=${mUmpire} umpireId=${m.umpireId} UmpireId=${m.UmpireId} startAtUtc=${m.startAtUtc} scheduledAt=${m.scheduledAt}`);
      });
      const umpireConflict = effectiveList.find((m: any) => {
        const mKey = toLocalDateKey(getSchedDate(m));
        return mKey === newUmpireKey && getMatchUmpire(m) === newUmpireId;
      });
      if (umpireConflict) {
        setDuplicateScheduleError('The selected Umpire already has a match scheduled on the same Date. Please choose a different Umpire or Date.');
        return;
      }
    } catch {
      // Fallback to cached data
      const dupMsg = checkDuplicateSchedule(newScheduledAt, newGroundId, newHomeTeamId, newAwayTeamId);
      if (dupMsg) {
        setDuplicateScheduleError(dupMsg);
        return;
      }
      // Fallback umpire conflict check
      const newUmpireKeyFallback = toLocalDateKey(newScheduledAt);
      if (newUmpireKeyFallback && newUmpireId) {
        const umpireConflict = allMatchList.find((m: any) => {
          const mKey = toLocalDateKey(getSchedDate(m));
          return mKey === newUmpireKeyFallback && getMatchUmpire(m) === newUmpireId;
        });
        if (umpireConflict) {
          setDuplicateScheduleError('The selected Umpire already has a match scheduled on the same Date. Please choose a different Umpire or Date.');
          return;
        }
      }
    }
    createMatchMutation.mutate();
  };

  const statusColor = (s: string) => s === 'Scheduled' ? 'bg-blue-100 text-blue-700' : s === 'Live' ? 'bg-green-100 text-green-700' : s === 'Completed' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700';

  // Custom time dropdown (replaces native <select> for hour/minute)
  const renderTimeDropdown = (
    value: string,
    options: string[],
    showDd: boolean,
    setShowDd: (v: boolean) => void,
    onChange: (v: string) => void,
    error?: boolean,
  ) => (
    <div className="relative">
      {showDd && <div className="fixed inset-0 z-[5]" onClick={() => setShowDd(false)} />}
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={value}
        onFocus={e => e.target.select()}
        onClick={() => setShowDd(!showDd)}
        onChange={e => {
          const max = options.length === 24 ? 23 : 59;
          const raw = e.target.value.replace(/\D/g, '');
          let num = parseInt(raw, 10);
          if (isNaN(num) || num < 0) num = 0;
          if (num > max) num = max;
          onChange(String(num).padStart(2, '0'));
        }}
        className={`input-field w-20 text-center cursor-pointer ${error ? 'border-red-500' : ''}`}
      />
      {showDd && (
        <div className="absolute z-20 mt-1 w-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map(o => (
            <button
              key={o}
              type="button"
              onClick={() => { onChange(o); setShowDd(false); }}
              className={`w-full text-center px-2 py-1.5 text-sm hover:bg-brand-green/10 border-b last:border-b-0 ${o === value ? 'bg-brand-green/20 font-medium' : ''}`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minuteOptions = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  // Searchable umpire dropdown using Umpire API data
  const renderUmpireDropdown = (
    search: string,
    setSearch: (v: string) => void,
    showDd: boolean,
    setShowDd: (v: boolean) => void,
    selected: { id: string; name: string; email?: string } | null,
    onSelect: (u: { id: string; name: string; email?: string }) => void,
    onClear: () => void,
  ) => {
    const q = search.toLowerCase();
    const getUmpireId = (u: any) => u.id || u.umpireId || '';
    const getUmpireName = (u: any) => u.umpireName || u.name || '';
    const filtered = umpireList.filter((u: any) =>
      !q || getUmpireName(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
    return (
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">Umpire <span className="text-red-500">*</span></label>
        {selected ? (
          <div className="flex items-center gap-2 input-field bg-gray-50">
            <span className="flex-1 text-sm truncate">{selected.name}</span>
            <button type="button" onClick={onClear} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
          </div>
        ) : (
          <>
            {showDd && (
              <div className="fixed inset-0 z-[5]" onClick={() => { setShowDd(false); setSearch(''); }} />
            )}
            <input
              type="text"
              placeholder="Search umpire"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDd(true); }}
              onFocus={() => setShowDd(true)}
              className="input-field"
            />
            {showDd && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filtered.length > 0 ? filtered.slice(0, 20).map((u: any) => (
                  <button
                    key={getUmpireId(u)}
                    type="button"
                    onClick={() => { onSelect({ id: getUmpireId(u), name: getUmpireName(u), email: u.email }); setShowDd(false); setSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-brand-green/10 border-b last:border-b-0"
                  >
                    <span className="font-medium">{getUmpireName(u)}</span>
                    {u.email && <span className="text-gray-400 ml-2 text-xs">{u.email}</span>}
                  </button>
                )) : (
                  <div className="px-3 py-2 text-sm text-gray-400">No umpires found</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // Reusable searchable user dropdown
  const renderUserSearchDropdown = (
    label: string,
    search: string,
    setSearch: (v: string) => void,
    showDropdown: boolean,
    setShowDropdown: (v: boolean) => void,
    selected: { id: string; firstName: string; lastName: string; email: string } | null,
    onSelect: (u: { id: string; firstName: string; lastName: string; email: string }) => void,
    onClear: () => void,
    excludeIds?: string[],
  ) => {
    const filteredList = filterUsers(search).filter((u: any) => !(excludeIds || []).includes(u.id));
    return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label.endsWith(' *') ? <>{label.slice(0, -2)} <span className="text-red-500">*</span></> : label}</label>
      {selected ? (
        <div className="flex items-center gap-2 input-field bg-gray-50">
          <span className="flex-1 text-sm truncate">{`${selected.firstName} ${selected.lastName}`.trim() || selected.email}</span>
          <button type="button" onClick={onClear} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
        </div>
      ) : (
        <>
          {showDropdown && <div className="fixed inset-0 z-[5]" onClick={() => { setShowDropdown(false); setSearch(''); }} />}
          <input
            type="text"
            placeholder={`Search ${label.replace(' *', '').toLowerCase()}`}
            value={search}
            onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            className="input-field"
          />
          {showDropdown && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filteredList.length > 0 ? filteredList.slice(0, 20).map((u: any) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onSelect(u); setShowDropdown(false); setSearch(''); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-green/10 border-b last:border-b-0"
                >
                  <span className="font-medium">{`${u.firstName} ${u.lastName}`.trim()}</span>
                  {u.email && <span className="text-gray-400 ml-2 text-xs">{u.email}</span>}
                </button>
              )) : (
                <div className="px-3 py-2 text-sm text-gray-400">No users found</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
  };

  // Reusable searchable team board dropdown (same UI as Team Board in CreateTrophyTab)
  const renderTeamBoardDropdown = (
    label: string,
    search: string,
    setSearch: (v: string) => void,
    showDropdown: boolean,
    setShowDropdown: (v: boolean) => void,
    selected: { id: string; name: string } | null,
    onSelect: (b: { id: string; name: string }) => void,
    onClear: () => void,
    excludeId?: string,
    opts?: { tournamentId?: string; teamSource?: any[]; teamsLoading?: boolean },
  ) => {
    const effectiveTournamentId = opts?.tournamentId !== undefined ? opts.tournamentId : newTournamentId;
    const noTournament = !effectiveTournamentId;
    const effectiveTeamSource = opts?.teamSource !== undefined ? opts.teamSource : tournamentTeamList;
    const effectiveTeamsLoading = opts?.teamsLoading !== undefined ? opts.teamsLoading : tournamentTeamsLoading;
    return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label.replace(' *', '')} {label.includes('*') && <span className="text-red-500">*</span>}</label>
      {selected ? (
        <div className="flex items-center gap-2 input-field bg-gray-50">
          <div className="w-6 h-6 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs">
            {selected.name?.[0]?.toUpperCase() || '?'}
          </div>
          <span className="flex-1 text-sm truncate">{selected.name}</span>
          <button type="button" onClick={onClear} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
        </div>
      ) : (
        <>
          {showDropdown && (
            <div className="fixed inset-0 z-[5]" onClick={() => { setShowDropdown(false); setSearch(''); }} />
          )}
          <div
            className={`w-full px-4 py-2.5 h-[42px] border border-gray-400 rounded-lg cursor-pointer flex items-center justify-between ${noTournament ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={() => { if (!noTournament) setShowDropdown(!showDropdown); }}
          >
            <span className="text-gray-400 text-sm">{noTournament ? 'Select tournament first' : 'Search team...'}</span>
          </div>
          {showDropdown && (
            <div className="absolute z-20 mt-2 w-full bg-white border border-gray-200 rounded-lg shadow-xl" style={{ top: '100%' }}>
              <div className="p-2 border-b border-gray-100">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-black focus:ring-2 focus:ring-brand-green focus:border-transparent"
                  placeholder="Search teams..."
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {effectiveTeamsLoading ? (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading teams...</div>
                ) : (() => {
                  const q = search.toLowerCase();
                  const source = effectiveTeamSource;
                  const filtered = source.filter((b: any) => (!excludeId || b.id !== excludeId) && (!q || b.name.toLowerCase().includes(q)));
                  return filtered.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 text-center">No teams found</div>
                  ) : (
                    filtered.map((b: any) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => { onSelect(b); setShowDropdown(false); setSearch(''); }}
                        className="w-full text-left px-4 py-2 hover:bg-brand-green/5 flex items-center gap-2 text-sm border-b last:border-0"
                      >
                        <div className="w-7 h-7 bg-brand-green/10 rounded-full flex items-center justify-center text-brand-green font-bold text-xs">
                          {b.logoUrl
                            ? <img src={b.logoUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                            : b.name?.[0]?.toUpperCase() || '?'
                          }
                        </div>
                        <span className="font-medium text-gray-900">{b.name}</span>
                      </button>
                    ))
                  );
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
    );
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Schedules & Results</h2>
        {!showCreate && !editMatchId && (
          <button onClick={() => {
            setShowCreate(true);
            sessionStorage.setItem('schedule_mode', 'create');
            resetCreateForm(); setCreateError(''); setCreateSuccess('');
          }} className="btn-primary text-sm flex items-center gap-2">
            <span className="text-xl font-bold leading-none">+</span> Create Match
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card mb-6 overflow-visible">
          <h3 className="font-semibold mb-4">Create Match</h3>
          {createError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{createError}</div>}
          {createSuccess && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{createSuccess}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tournament <span className="text-red-500">*</span></label>
              <select value={newTournamentId} onChange={e => { setNewTournamentId(e.target.value); ssSet('tournamentId', e.target.value); if (formErrors.tournament) setFormErrors(p => ({ ...p, tournament: '' })); }} className={`input-field ${formErrors.tournament ? 'border-red-500' : ''}`}>
                <option value="">Select Tournament</option>
                {tournamentList.map((t: any) => <option key={t.id} value={t.id}>{t.tournamentName || t.name}</option>)}
              </select>
              {formErrors.tournament && <p className="text-red-500 text-xs mt-1">{formErrors.tournament}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Game Type <span className="text-red-500">*</span></label>
              <select value={newGameType} onChange={e => { setNewGameType(e.target.value); ssSet('gameType', e.target.value); if (formErrors.gameType) setFormErrors(p => ({ ...p, gameType: '' })); }} className={`input-field ${formErrors.gameType ? 'border-red-500' : ''}`}>
                <option value="">Select Game Type</option>
                {(gameTypeOptions || []).map((gt: string) => <option key={gt} value={gt}>{gt}</option>)}
              </select>
              {formErrors.gameType && <p className="text-red-500 text-xs mt-1">{formErrors.gameType}</p>}
            </div>
            {renderTeamBoardDropdown(
              'Home Team *', homeTeamSearch, setHomeTeamSearch,
              showHomeTeamDropdown, setShowHomeTeamDropdown,
              selectedHomeTeam,
              (b) => { setSelectedHomeTeam(b); setNewHomeTeamId(b.id); ssSet('homeTeamId', b.id); if (b.id === newAwayTeamId) { setNewAwayTeamId(''); setSelectedAwayTeam(null); ssSet('awayTeamId', ''); } if (formErrors.homeTeam) setFormErrors(p => ({ ...p, homeTeam: '' })); },
              () => { setSelectedHomeTeam(null); setNewHomeTeamId(''); ssSet('homeTeamId', ''); setHomeTeamSearch(''); },
              newAwayTeamId,
            )}
            {renderTeamBoardDropdown(
              'Away Team *', awayTeamSearch, setAwayTeamSearch,
              showAwayTeamDropdown, setShowAwayTeamDropdown,
              selectedAwayTeam,
              (b) => { setSelectedAwayTeam(b); setNewAwayTeamId(b.id); ssSet('awayTeamId', b.id); if (formErrors.awayTeam) setFormErrors(p => ({ ...p, awayTeam: '' })); },
              () => { setSelectedAwayTeam(null); setNewAwayTeamId(''); ssSet('awayTeamId', ''); setAwayTeamSearch(''); },
              newHomeTeamId,
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ground <span className="text-red-500">*</span></label>
              <select value={newGroundId} onChange={e => { setNewGroundId(e.target.value); ssSet('groundId', e.target.value); if (formErrors.ground) setFormErrors(p => ({ ...p, ground: '' })); }} className={`input-field ${formErrors.ground ? 'border-red-500' : ''}`}>
                <option value="">Select Ground</option>
                {groundList.map((g: any) => <option key={g.groundId} value={g.groundId}>{g.groundName}</option>)}
              </select>
              {formErrors.ground && <p className="text-red-500 text-xs mt-1">{formErrors.ground}</p>}
            </div>
            <div>
              {renderUmpireDropdown(
                umpireSearch, setUmpireSearch,
                showUmpireDropdown, setShowUmpireDropdown,
                selectedUmpire,
                (u) => { setSelectedUmpire(u); setNewUmpireId(u.id); ssSet('umpireId', u.id); if (formErrors.umpire) setFormErrors(p => ({ ...p, umpire: '' })); },
                () => { setSelectedUmpire(null); setNewUmpireId(''); ssSet('umpireId', ''); setUmpireSearch(''); },
              )}
              {formErrors.umpire && <p className="text-red-500 text-xs mt-1">{formErrors.umpire}</p>}
            </div>
            {renderUserSearchDropdown(
              'App Scorer *', appScorerSearch, setAppScorerSearch,
              showAppScorerDropdown, setShowAppScorerDropdown,
              selectedAppScorer,
              (u) => { setSelectedAppScorer(u); setNewAppScorerId(u.id); ssSet('appScorerId', u.id); setSelectedPortalScorer(u); setNewPortalScorerId(u.id); ssSet('portalScorerId', u.id); setPortalScorerSearch(''); },
              () => { setSelectedAppScorer(null); setNewAppScorerId(''); ssSet('appScorerId', ''); setAppScorerSearch(''); setSelectedPortalScorer(null); setNewPortalScorerId(''); ssSet('portalScorerId', ''); setPortalScorerSearch(''); },
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time <span className="text-red-500">*</span></label>
              <div className="flex gap-2 items-center">
                <input type="date" min={new Date().toISOString().slice(0, 10)} max="9999-12-31" value={newScheduledAt ? newScheduledAt.slice(0, 10) : ''} onChange={e => { const d = e.target.value; if (d && d.length > 10) return; const t = newScheduledAt ? newScheduledAt.slice(11) : '00:00'; const v = d ? `${d}T${t}` : ''; setNewScheduledAt(v); ssSet('startAtUtc', v ? new Date(v).toISOString() : ''); if (formErrors.scheduledAt) setFormErrors(p => ({ ...p, scheduledAt: '' })); }} className={`input-field flex-1 ${formErrors.scheduledAt ? 'border-red-500' : ''}`} />
                {renderTimeDropdown(
                  newScheduledAt ? newScheduledAt.slice(11, 13) : '00',
                  hourOptions,
                  showHourDropdown,
                  setShowHourDropdown,
                  (h) => { const d = newScheduledAt ? newScheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10); const m = newScheduledAt ? newScheduledAt.slice(14, 16) : '00'; const v = `${d}T${h}:${m}`; setNewScheduledAt(v); ssSet('startAtUtc', v ? new Date(v).toISOString() : ''); if (formErrors.scheduledAt) setFormErrors(p => ({ ...p, scheduledAt: '' })); },
                  !!formErrors.scheduledAt,
                )}
                {renderTimeDropdown(
                  newScheduledAt ? newScheduledAt.slice(14, 16) : '00',
                  minuteOptions,
                  showMinuteDropdown,
                  setShowMinuteDropdown,
                  (m) => { const d = newScheduledAt ? newScheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10); const h = newScheduledAt ? newScheduledAt.slice(11, 13) : '00'; const v = `${d}T${h}:${m}`; setNewScheduledAt(v); ssSet('startAtUtc', v ? new Date(v).toISOString() : ''); if (formErrors.scheduledAt) setFormErrors(p => ({ ...p, scheduledAt: '' })); },
                  !!formErrors.scheduledAt,
                )}
              </div>
              {formErrors.scheduledAt && <p className="text-red-500 text-xs mt-1">{formErrors.scheduledAt}</p>}
            </div>
          </div>
          {duplicateScheduleError && <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{duplicateScheduleError}</div>}
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => {
                const hasData = newTournamentId || newHomeTeamId || newAwayTeamId || newGroundId || newUmpireId || newAppScorerId || newPortalScorerId || newScheduledAt || newGameType;
                if (hasData) { setShowCreateCancelConfirm(true); return; }
                sessionStorage.removeItem('schedule_mode');
                ssClearAll();
                setShowCreate(false);
              }}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={validateAndCreate}
              disabled={!isCreateFormValid || createMatchMutation.isPending}
              className={`text-sm px-6 rounded-lg py-2 font-medium transition-colors ${isCreateFormValid && !createMatchMutation.isPending ? 'btn-primary' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
            >
              {createMatchMutation.isPending ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {!showCreate && (
        <>
      {!editMatchId && (
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">From</label><input type="date" value={from} max={to || '9999-12-31'} onChange={e => { const v = e.target.value; if (v && v.length > 10) return; if (v && to && v > to) { setFrom(v); setTo(v); } else { setFrom(v); } }} className="input-field" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">To</label><input type="date" value={to} min={from} max="9999-12-31" onChange={e => { const v = e.target.value; if (v && v.length > 10) return; if (v && from && v < from) { setTo(v); setFrom(v); } else { setTo(v); } }} className="input-field" /></div>
        </div>
      </div>
      )}

      {editMatchId && (
        <div className="card mb-6 overflow-visible">
          <h3 className="font-semibold mb-4">Edit Schedule</h3>
          {editError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{editError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tournament <span className="text-red-500">*</span></label>
              <select value={editTournamentId} onChange={e => { setEditTournamentId(e.target.value); setEditHomeTeamId(''); setEditAwayTeamId(''); setSelectedEditHomeTeam(null); setSelectedEditAwayTeam(null); setEditHomeTeamSearch(''); setEditAwayTeamSearch(''); setEditDuplicateScheduleError(''); }} className="input-field">
                <option value="">Select Tournament</option>
                {tournamentList.map((t: any) => <option key={t.id} value={t.id}>{t.tournamentName || t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Game Type <span className="text-red-500">*</span></label>
              <select value={editGameType} onChange={e => setEditGameType(e.target.value)} className="input-field">
                <option value="">Select Game Type</option>
                {(gameTypeOptions || []).map((gt: string) => <option key={gt} value={gt}>{gt}</option>)}
              </select>
            </div>
            {renderTeamBoardDropdown(
              'Home Team *', editHomeTeamSearch, setEditHomeTeamSearch,
              showEditHomeTeamDropdown, setShowEditHomeTeamDropdown,
              selectedEditHomeTeam,
              (b) => { setSelectedEditHomeTeam(b); setEditHomeTeamId(b.id); if (b.id === editAwayTeamId) { setEditAwayTeamId(''); setSelectedEditAwayTeam(null); } },
              () => { setSelectedEditHomeTeam(null); setEditHomeTeamId(''); setEditHomeTeamSearch(''); },
              editAwayTeamId,
              { tournamentId: editTournamentId, teamSource: editTournamentTeamList, teamsLoading: editTournamentTeamsLoading },
            )}
            {renderTeamBoardDropdown(
              'Away Team *', editAwayTeamSearch, setEditAwayTeamSearch,
              showEditAwayTeamDropdown, setShowEditAwayTeamDropdown,
              selectedEditAwayTeam,
              (b) => { setSelectedEditAwayTeam(b); setEditAwayTeamId(b.id); },
              () => { setSelectedEditAwayTeam(null); setEditAwayTeamId(''); setEditAwayTeamSearch(''); },
              editHomeTeamId,
              { tournamentId: editTournamentId, teamSource: editTournamentTeamList, teamsLoading: editTournamentTeamsLoading },
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ground <span className="text-red-500">*</span></label>
              <select value={editGround} onChange={e => setEditGround(e.target.value)} className="input-field">
                <option value="">Select Ground</option>
                {groundList.map((g: any) => <option key={g.groundId} value={g.groundId}>{g.groundName}</option>)}
              </select>
            </div>
            {renderUmpireDropdown(
              editUmpireSearchText, setEditUmpireSearchText,
              showEditUmpireDropdown, setShowEditUmpireDropdown,
              selectedEditUmpire,
              (u) => { setSelectedEditUmpire(u); setEditUmpire(u.id); setEditDuplicateScheduleError(''); },
              () => { setSelectedEditUmpire(null); setEditUmpire(''); setEditUmpireSearchText(''); setEditDuplicateScheduleError(''); },
            )}
            {renderUserSearchDropdown(
              'App Scorer *', editAppScorerSearch, setEditAppScorerSearch,
              showEditAppScorerDropdown, setShowEditAppScorerDropdown,
              selectedEditAppScorer,
              (u) => { setSelectedEditAppScorer(u); setEditAppScorer(u.id); setSelectedEditPortalScorer(u); setEditPortalScorer(u.id); setEditPortalScorerSearch(''); },
              () => { setSelectedEditAppScorer(null); setEditAppScorer(''); setEditAppScorerSearch(''); setSelectedEditPortalScorer(null); setEditPortalScorer(''); setEditPortalScorerSearch(''); },
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time <span className="text-red-500">*</span></label>
              <div className="flex gap-2 items-center">
                <input type="date" min={new Date().toISOString().slice(0, 10)} max="9999-12-31" value={editScheduledAt ? editScheduledAt.slice(0, 10) : ''} onChange={e => { const d = e.target.value; if (d && d.length > 10) return; const t = editScheduledAt ? editScheduledAt.slice(11) : '00:00'; setEditScheduledAt(d ? `${d}T${t}` : ''); setEditDuplicateScheduleError(''); }} className="input-field flex-1" />
                {renderTimeDropdown(
                  editScheduledAt ? editScheduledAt.slice(11, 13) : '00',
                  hourOptions,
                  showEditHourDropdown,
                  setShowEditHourDropdown,
                  (h) => { const d = editScheduledAt ? editScheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10); const m = editScheduledAt ? editScheduledAt.slice(14, 16) : '00'; setEditScheduledAt(`${d}T${h}:${m}`); },
                )}
                {renderTimeDropdown(
                  editScheduledAt ? editScheduledAt.slice(14, 16) : '00',
                  minuteOptions,
                  showEditMinuteDropdown,
                  setShowEditMinuteDropdown,
                  (m) => { const d = editScheduledAt ? editScheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10); const h = editScheduledAt ? editScheduledAt.slice(11, 13) : '00'; setEditScheduledAt(`${d}T${h}:${m}`); },
                )}
              </div>
            </div>
          </div>
          {editDuplicateScheduleError && <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{editDuplicateScheduleError}</div>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={cancelEdit} className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-400 transition-colors">Cancel</button>
            <button onClick={async () => {
              try {
                const freshRes = await leagueService.getSchedule(boardId, '2020-01-01', '2030-12-31');
                const freshData = freshRes.data;
                const freshListRaw = unwrapValues(freshData);
                const freshList = freshListRaw.length > 0 ? freshListRaw : (Array.isArray(freshData) ? freshData : (freshData as any)?.items ?? (freshData as any)?.data ?? []);
                const editKey = toMinuteKey(editScheduledAt);
                const getScheduleId = (m: any): string => m.id || m.scheduleId || m.Id || m.ScheduleId || '';
                const isSelf = (m: any) => { const sid = getScheduleId(m); return sid === editMatchId || m.id === editMatchId || m.scheduleId === editMatchId || m.Id === editMatchId || m.ScheduleId === editMatchId; };
                const dup = freshList.find((m: any) => {
                  if (isSelf(m)) return false;
                  const mKey = toMinuteKey(getSchedDate(m));
                  return mKey === editKey && getGroundId(m) === editGround && getHomeId(m) === editHomeTeamId && getAwayId(m) === editAwayTeamId;
                });
                if (dup) {
                  const dupMsg = 'A schedule with the same Date & Time, Ground, Home Team, and Away Team already exists. Duplicate entries are not allowed.';
                  setEditDuplicateScheduleError(dupMsg);
                  return;
                }
                // Check umpire conflict: same umpire on the same date
                const editUmpireKey = toLocalDateKey(editScheduledAt);
                const umpireConflict = freshList.find((m: any) => {
                  if (isSelf(m)) return false;
                  const mKey = toLocalDateKey(getSchedDate(m));
                  return mKey === editUmpireKey && getMatchUmpire(m) === editUmpire;
                });
                if (umpireConflict) {
                  setEditDuplicateScheduleError('The selected Umpire already has a match scheduled on the same Date. Please choose a different Umpire or Date.');
                  return;
                }
              } catch {
                const dupMsg = checkDuplicateSchedule(editScheduledAt, editGround, editHomeTeamId, editAwayTeamId, editMatchId);
                if (dupMsg) { setEditDuplicateScheduleError(dupMsg); return; }
                // Fallback umpire conflict check
                const editUmpireKeyFb = toLocalDateKey(editScheduledAt);
                if (editUmpireKeyFb && editUmpire) {
                  const isSelfFb = (m: any) => m.id === editMatchId || m.scheduleId === editMatchId || m.Id === editMatchId || m.ScheduleId === editMatchId;
                  const umpireConflict = allMatchList.find((m: any) => {
                    if (isSelfFb(m)) return false;
                    const mKey = toLocalDateKey(getSchedDate(m));
                    return mKey === editUmpireKeyFb && getMatchUmpire(m) === editUmpire;
                  });
                  if (umpireConflict) { setEditDuplicateScheduleError('The selected Umpire already has a match scheduled on the same Date. Please choose a different Umpire or Date.'); return; }
                }
              }
              updateMatchMutation.mutate();
            }} disabled={!editTournamentId || !editGameType || !editHomeTeamId || !editAwayTeamId || !editScheduledAt || updateMatchMutation.isPending} className="btn-primary text-sm px-6">{updateMatchMutation.isPending ? 'Updating...' : 'Update'}</button>
          </div>
        </div>
      )}

      {/* View details (read-only) */}
      {viewMatchId && !editMatchId && (() => {
        const m = matchList.find((x: any) => x.id === viewMatchId);
        if (!m) return null;
        return (
          <div className="bg-white rounded-lg shadow-sm mb-6">
            <div className="bg-gray-100 px-6 py-3 border-b">
              <h2 className="text-base font-bold text-gray-800">View Schedule</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tournament</label>
                  <input value={lookupTournamentName(m)} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Game Type</label>
                  <input value={m.gameType || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Home Team</label>
                  <input value={m.homeTeamName || lookupTeamName(m.homeTeamId || m.homeTeamBoardId)} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Away Team</label>
                  <input value={m.awayTeamName || lookupTeamName(m.awayTeamId || m.awayTeamBoardId)} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ground</label>
                  <input value={m.groundName || lookupGroundName(m.groundId)} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Umpire</label>
                  <input value={m.umpireName || lookupUmpireName(m.umpireId)} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">App Scorer</label>
                  <input value={m.scorerName || lookupUserName(m.appScorerId) || '-'} readOnly className="input-field bg-gray-100 cursor-default" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                  <div className="flex gap-2 items-center">
                    <input type="date" value={(() => { const raw = ensureUtc(m.startAtUtc || m.scheduledAt); if (!raw) return ''; try { const d = new Date(raw); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } catch { return ''; } })()} readOnly className="input-field flex-1 bg-gray-100 cursor-default" />
                    <input value={(() => { const raw = ensureUtc(m.startAtUtc || m.scheduledAt); if (!raw) return '00'; try { return String(new Date(raw).getHours()).padStart(2, '0'); } catch { return '00'; } })()} readOnly className="input-field w-16 text-center bg-gray-100 cursor-default" />
                    <input value={(() => { const raw = ensureUtc(m.startAtUtc || m.scheduledAt); if (!raw) return '00'; try { return String(new Date(raw).getMinutes()).padStart(2, '0'); } catch { return '00'; } })()} readOnly className="input-field w-16 text-center bg-gray-100 cursor-default" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <button onClick={() => setViewMatchId(null)} className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {!editMatchId && !viewMatchId && (
      <div className="card">
        <table className="w-full text-sm table-fixed">
          <thead><tr className="text-white text-left font-bold text-sm" style={{backgroundColor: '#8091A5'}}><th className="py-3 px-4 rounded-tl-lg w-[13%]">Tournament</th><th className="py-3 px-4 w-[11%]">Home</th><th className="py-3 px-4 w-[11%]">Away</th><th className="py-3 px-4 w-[11%]">Ground</th><th className="py-3 px-4 w-[9%]">Umpire</th><th className="py-3 px-4 w-[11%]">App Scorer</th><th className="py-3 px-4 w-[14%]">Date</th><th className="py-3 px-4 w-[10%]">Status</th><th className="py-3 px-4 rounded-tr-lg w-[10%]">Actions</th></tr></thead>
          <tbody>
            {matchList.map((m: any) => (
              <tr key={m.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="py-3 px-4 truncate">{lookupTournamentName(m)}</td>
                <td className="py-3 px-4 truncate">{m.homeTeamName || lookupTeamName(m.homeTeamId || m.homeTeamBoardId)}</td>
                <td className="py-3 px-4 truncate">{m.awayTeamName || lookupTeamName(m.awayTeamId || m.awayTeamBoardId)}</td>
                <td className="py-3 px-4 truncate">{m.groundName || lookupGroundName(m.groundId)}</td>
                <td className="py-3 px-4 truncate">{m.umpireName || lookupUmpireName(m.umpireId)}</td>
                <td className="py-3 px-4 truncate">{m.scorerName || lookupUserName(m.appScorerId) || '-'}</td>
                <td className="py-3 px-4 truncate">{formatDateTime(ensureUtc(m.startAtUtc || m.scheduledAt))}</td>
                <td className="py-3 px-4">{(() => {
                  const s = m.status || 'Scheduled';
                  const inProg = ['Live', 'InProgress', 'In Progress', 'In_Progress', 'Started'].includes(s);
                  const completed = s === 'Completed';
                  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1 ${inProg ? 'bg-green-100 text-green-700' : completed ? 'bg-gray-200 text-gray-700' : 'bg-blue-100 text-blue-700'}`}>{inProg && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}{inProg ? 'In Progress' : s}</span>;
                })()}</td>
                <td className="py-3 px-4"><div className="flex items-center gap-4">
                  <button onClick={() => { setViewMatchId(m.id); setEditMatchId(null); }} className="text-gray-500 hover:text-gray-700" title="View">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                  <button onClick={() => handleEditMatch(m)} className="text-blue-500 hover:text-blue-700" title="Edit">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button onClick={() => setDeleteConfirmId(m.id)} className="text-red-500 hover:text-red-700" title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div></td>
              </tr>
            ))}
            {(!matchList.length) && <tr><td colSpan={8} className="py-8 text-center text-gray-400">No matches in selected date range.</td></tr>}
          </tbody>
        </table>
      </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <h3 className="text-base font-bold text-gray-800 mb-1">Delete Schedule?</h3>
              <p className="text-xs text-gray-500 mb-4">Are you sure you want to delete this match schedule? This action cannot be undone.</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">Cancel</button>
                <button onClick={() => deleteMatchMutation.mutate(deleteConfirmId)} disabled={deleteMatchMutation.isPending} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">
                  {deleteMatchMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Discard Changes?</h3>
              <p className="text-xs text-gray-500 mb-4">You have unsaved changes. Are you sure you want to discard them?</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setShowCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">No, Keep Editing</button>
                <button onClick={confirmCancelEdit} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Yes, Discard</button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}

      {/* Create Form Cancel Confirmation Modal */}
      {showCreateCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateCancelConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-4 animate-fade-in">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1">Discard Changes?</h3>
              <p className="text-xs text-gray-500 mb-4">You have unsaved changes. Are you sure you want to discard them?</p>
              <div className="flex gap-3 w-full">
                <button onClick={() => setShowCreateCancelConfirm(false)} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">No, Keep Editing</button>
                <button onClick={() => { setShowCreateCancelConfirm(false); resetCreateForm(); setCreateError(''); setCreateSuccess(''); setShowCreate(false); }} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium transition-colors text-sm">Yes, Discard</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- APPLICATIONS TAB --
function ApplicationsTab({ boardId }: { boardId: string }) {
  const [selectedTournament, setSelectedTournament] = useState('');
  const qc = useQueryClient();
  const { data: tournaments } = useQuery({ queryKey: ['tournaments', boardId], queryFn: () => tournamentService.getByBoard(boardId).then(r => {
    const d = r.data;
    return Array.isArray(d) ? d : (d as any)?.items ?? (d as any)?.data ?? [];
  }) });
  const tournamentList = (Array.isArray(tournaments) ? tournaments : []).slice().sort((a: any, b: any) => {
    const nameA = (a.tournamentName || a.name || '').toLowerCase();
    const nameB = (b.tournamentName || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  const { data: apps } = useQuery({
    queryKey: ['applications', selectedTournament],
    queryFn: () => leagueService.getApplications(selectedTournament).then(r => r.data),
    enabled: !!selectedTournament,
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => leagueService.updateApplicationStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications', selectedTournament] }),
  });

  return (
    <div className="animate-fade-in">
      <h2 className="text-xl font-bold text-gray-800 mb-6">League Applications</h2>
      <div className="card mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Tournament</label>
        <select value={selectedTournament} onChange={e => setSelectedTournament(e.target.value)} className="input-field max-w-md">
          <option value="">Choose a tournament...</option>
          {tournamentList.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {selectedTournament && (
        <div className="card">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-gray-700 font-bold text-sm"><th className="pb-3">Team</th><th className="pb-3">Payment</th><th className="pb-3">Waiver</th><th className="pb-3">Status</th><th className="pb-3">Submitted</th><th className="pb-3">Actions</th></tr></thead>
            <tbody>
              {apps?.map(a => (
                <tr key={a.id} className="border-b last:border-b-0 hover:bg-gray-50">
                  <td className="py-3 font-medium">{a.teamName}</td>
                  <td className="py-3">{a.paymentAmount ? `$${a.paymentAmount}` : '-'} {a.paymentStatus && <span className="text-xs text-gray-400">({a.paymentStatus})</span>}</td>
                  <td className="py-3">{a.waiverSigned ? '?' : '?'}</td>
                  <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs ${a.status === 'Approved' ? 'bg-green-100 text-green-700' : a.status === 'Rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{a.status}</span></td>
                  <td className="py-3 text-xs">{formatDateOnly(a.submittedAt)}</td>
                  <td className="py-3 space-x-2">
                    {a.status === 'Pending' && (<>
                      <button onClick={() => statusMutation.mutate({ id: a.id, status: 'Approved' })} className="text-green-600 hover:text-green-800 text-xs font-medium">Approve</button>
                      <button onClick={() => statusMutation.mutate({ id: a.id, status: 'Rejected' })} className="text-red-500 hover:text-red-700 text-xs font-medium">Reject</button>
                    </>)}
                  </td>
                </tr>
              ))}
              {(!apps?.length) && <tr><td colSpan={6} className="py-8 text-center text-gray-400">No applications for this tournament.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// -- INVOICES TAB --
function InvoicesTab({ boardId }: { boardId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState(''); const [description, setDescription] = useState(''); const [dueDate, setDueDate] = useState('');
  const qc = useQueryClient();
  const { data: invoices } = useQuery({ queryKey: ['invoices', boardId], queryFn: () => leagueService.getInvoices(boardId).then(r => r.data) });
  const createMutation = useMutation({
    mutationFn: () => leagueService.createInvoice(boardId, { amount: parseFloat(amount), description, dueDate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices', boardId] }); setShowForm(false); setAmount(''); setDescription(''); setDueDate(''); },
  });
  const payMutation = useMutation({
    mutationFn: ({ id, amt }: { id: string; amt: number }) => leagueService.recordPayment(id, amt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices', boardId] }),
  });

  const statusColor = (s: string) => s === 'Paid' ? 'bg-green-100 text-green-700' : s === 'Partial' ? 'bg-yellow-100 text-yellow-700' : s === 'Overdue' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600';

  return (
    <div className="animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">Invoicing</h2>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm px-4">{showForm ? 'Cancel' : '+ Create Invoice'}</button>
      </div>
      {showForm && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">Create Invoice</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount <span className="text-red-500">*</span></label><input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date <span className="text-red-500">*</span></label><input type="date" max="9999-12-31" value={dueDate} onChange={e => { const v = e.target.value; if (v && v.length > 10) return; setDueDate(v); }} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><input value={description} onChange={e => setDescription(e.target.value)} className="input-field" /></div>
          </div>
          <button onClick={() => amount && dueDate && createMutation.mutate()} disabled={!amount || !dueDate || createMutation.isPending}
            className="btn-primary text-sm px-6 mt-4">{createMutation.isPending ? 'Creating...' : 'Create Invoice'}</button>
        </div>
      )}
      <div className="card">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-gray-700 font-bold text-sm"><th className="pb-3">Invoice #</th><th className="pb-3">Description</th><th className="pb-3">Amount</th><th className="pb-3">Paid</th><th className="pb-3">Due Date</th><th className="pb-3">Status</th><th className="pb-3">Actions</th></tr></thead>
          <tbody>
            {invoices?.map(inv => (
              <tr key={inv.id} className="border-b last:border-b-0 hover:bg-gray-50">
                <td className="py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="py-3">{inv.description || '-'}</td>
                <td className="py-3 font-medium">${inv.amount.toFixed(2)}</td>
                <td className="py-3">${(inv.paidAmount ?? 0).toFixed(2)}</td>
                <td className="py-3 text-xs">{formatDateOnly(inv.dueDate)}</td>
                <td className="py-3"><span className={`px-2 py-1 rounded-full text-xs ${statusColor(inv.status)}`}>{inv.status}</span></td>
                <td className="py-3">
                  {inv.status !== 'Paid' && (
                    <button onClick={() => {
                      const amt = prompt('Enter payment amount:');
                      if (amt) payMutation.mutate({ id: inv.id, amt: parseFloat(amt) });
                    }} className="text-brand-green hover:text-brand-dark text-xs font-medium">Record Payment</button>
                  )}
                </td>
              </tr>
            ))}
            {(!invoices?.length) && <tr><td colSpan={7} className="py-8 text-center text-gray-400">No invoices created yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
