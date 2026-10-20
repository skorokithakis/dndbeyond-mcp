export interface DdbApiResponse<T> {
  id: number;
  success: boolean;
  message: string;
  data: T;
  pagination: unknown | null;
}

export interface DdbErrorResponse {
  success: false;
  message: string;
  data: {
    serverMessage: string;
    errorCode: string;
  };
}

export interface DdbCampaignResponse {
  status: string;
  data: DdbCampaign[];
}

export interface DdbCampaign {
  id: number;
  name: string;
  dmId: number;
  dmUsername: string;
  playerCount: number;
  dateCreated: string;
  characters?: DdbCampaignCharacter2[];
}

export interface DdbCampaignCharacter {
  characterId: number;
  characterName: string;
  userId: number;
  username: string;
}

export interface DdbCampaignCharacter2 {
  id: number;
  name: string;
  userId: number;
  userName: string;
  avatarUrl: string;
  characterStatus: number;
  isAssigned: boolean;
}

// Entry from character-service's "my characters" list. It carries enough display data
// to render a list without fetching every character sheet. campaignId and campaignName
// are null for characters that are not in a campaign.
export interface DdbUserCharacterListItem {
  id: number;
  level: number;
  name: string;
  raceName: string;
  classDescription: string;
  campaignId: number | null;
  campaignName: string | null;
}

export interface DdbUserCharacterList {
  characterSlotLimit: number;
  canUnlockCharacters: boolean;
  characters: DdbUserCharacterListItem[];
}
