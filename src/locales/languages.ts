export type SupportedLanguage =
  // Official Eighth Schedule Languages + English
  | 'en'
  | 'hi'
  | 'bn'
  | 'te'
  | 'mr'
  | 'ta'
  | 'ur'
  | 'gu'
  | 'kn'
  | 'ml'
  | 'or'
  | 'pa'
  | 'as'
  | 'mai'
  | 'sat'
  | 'ks'
  | 'ne'
  | 'gom'
  | 'sd'
  | 'doi'
  | 'mni'
  | 'brx'
  | 'sa'
  // Regional & State Languages
  | 'bho'
  | 'mwr'
  | 'hne'
  | 'bgc'
  | 'mag'
  | 'gbm'
  | 'kfy'
  | 'lbj'
  | 'lus'
  | 'kha'
  | 'grt'
  | 'tcy'
  | 'raj';

export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  flag: string;
  category: 'official' | 'regional';
  region: string;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  // Official Languages (Union & 8th Schedule)
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇮🇳', category: 'official', region: 'National / Military Standard' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', category: 'official', region: 'National / North & Central' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳', category: 'official', region: 'West Bengal, Tripura, Assam' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳', category: 'official', region: 'Andhra Pradesh, Telangana' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳', category: 'official', region: 'Maharashtra, Goa' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳', category: 'official', region: 'Tamil Nadu, Puducherry' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇮🇳', category: 'official', region: 'J&K, Telangana, UP, Bihar' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳', category: 'official', region: 'Gujarat, DNH & DD' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳', category: 'official', region: 'Karnataka' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳', category: 'official', region: 'Kerala, Lakshadweep' },
  { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', flag: '🇮🇳', category: 'official', region: 'Odisha' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳', category: 'official', region: 'Punjab, Delhi, Haryana' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', flag: '🇮🇳', category: 'official', region: 'Assam, NE Frontier' },
  { code: 'mai', name: 'Maithili', nativeName: 'मैथिली', flag: '🇮🇳', category: 'official', region: 'Bihar, Jharkhand' },
  { code: 'sat', name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', flag: '🇮🇳', category: 'official', region: 'Jharkhand, West Bengal, Odisha' },
  { code: 'ks', name: 'Kashmiri', nativeName: 'کٲشُر / कॉशुर', flag: '🇮🇳', category: 'official', region: 'Jammu & Kashmir Sector' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', flag: '🇮🇳', category: 'official', region: 'Sikkim, North Bengal, Gorkha' },
  { code: 'gom', name: 'Konkani', nativeName: 'कोंकणी', flag: '🇮🇳', category: 'official', region: 'Goa, Coastal Konkan' },
  { code: 'sd', name: 'Sindhi', nativeName: 'सिंधी / سنڌي', flag: '🇮🇳', category: 'official', region: 'Gujarat, Rajasthan' },
  { code: 'doi', name: 'Dogri', nativeName: 'डोगरी', flag: '🇮🇳', category: 'official', region: 'Jammu, Himachal Sector' },
  { code: 'mni', name: 'Manipuri (Meitei)', nativeName: 'মৈতৈলোন্', flag: '🇮🇳', category: 'official', region: 'Manipur, NE Sector' },
  { code: 'brx', name: 'Bodo', nativeName: 'बड़ो', flag: '🇮🇳', category: 'official', region: 'Bodoland, Assam' },
  { code: 'sa', name: 'Sanskrit', nativeName: 'संस्कृतम्', flag: '🇮🇳', category: 'official', region: 'Classical Cultural Heritage' },

  // Regional Indian Languages
  { code: 'bho', name: 'Bhojpuri', nativeName: 'भोजपुरी', flag: '🇮🇳', category: 'regional', region: 'Purvanchal, Bihar, UP' },
  { code: 'mwr', name: 'Marwari', nativeName: 'मारवाड़ी', flag: '🇮🇳', category: 'regional', region: 'Rajasthan Desert Sector' },
  { code: 'hne', name: 'Chhattisgarhi', nativeName: 'छत्तीसगढ़ी', flag: '🇮🇳', category: 'regional', region: 'Chhattisgarh' },
  { code: 'bgc', name: 'Haryanvi', nativeName: 'हरियाणवी', flag: '🇮🇳', category: 'regional', region: 'Haryana, NCR Sector' },
  { code: 'mag', name: 'Magahi', nativeName: 'मगही', flag: '🇮🇳', category: 'regional', region: 'Central Bihar' },
  { code: 'gbm', name: 'Garhwali', nativeName: 'गढ़वाली', flag: '🇮🇳', category: 'regional', region: 'Garhwal Himalayas (Uttarakhand)' },
  { code: 'kfy', name: 'Kumaoni', nativeName: 'कुमाऊँनी', flag: '🇮🇳', category: 'regional', region: 'Kumaon Himalayas (Uttarakhand)' },
  { code: 'lbj', name: 'Ladakhi', nativeName: 'ལ་དྭགས་སྐད་', flag: '🇮🇳', category: 'regional', region: 'Ladakh High-Altitude Border Sector' },
  { code: 'lus', name: 'Mizo', nativeName: 'Mizo ṭawng', flag: '🇮🇳', category: 'regional', region: 'Mizoram Hills Sector' },
  { code: 'kha', name: 'Khasi', nativeName: 'Ka Ktien Khasi', flag: '🇮🇳', category: 'regional', region: 'Meghalaya Highlands' },
  { code: 'grt', name: 'Garo', nativeName: 'A·chik', flag: '🇮🇳', category: 'regional', region: 'Garo Hills, Meghalaya' },
  { code: 'tcy', name: 'Tulu', nativeName: 'ತುಳು', flag: '🇮🇳', category: 'regional', region: 'Coastal Karnataka & Tulunadu' },
  { code: 'raj', name: 'Rajasthani', nativeName: 'राजस्थानी', flag: '🇮🇳', category: 'regional', region: 'Western Border Sector' },
];
