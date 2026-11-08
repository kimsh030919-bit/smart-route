import {
  Coffee,
  Film,
  Landmark,
  MapPin,
  ShoppingBag,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import type { Category } from '../types';

export interface CategoryMeta {
  key: Category;
  label: string;
  icon: LucideIcon;
  /** 기본 체류시간(분) */
  defaultStay: number;
  /** 지도 핀/배지 색 */
  color: string;
  bg: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  cafe: {
    key: 'cafe',
    label: '카페',
    icon: Coffee,
    defaultStay: 50,
    color: '#b45309',
    bg: 'bg-amber-50 text-amber-700',
  },
  food: {
    key: 'food',
    label: '음식점',
    icon: UtensilsCrossed,
    defaultStay: 70,
    color: '#be123c',
    bg: 'bg-rose-50 text-rose-700',
  },
  attraction: {
    key: 'attraction',
    label: '관광지',
    icon: Landmark,
    defaultStay: 90,
    color: '#1d4ed8',
    bg: 'bg-blue-50 text-blue-700',
  },
  shopping: {
    key: 'shopping',
    label: '쇼핑몰',
    icon: ShoppingBag,
    defaultStay: 80,
    color: '#7e22ce',
    bg: 'bg-purple-50 text-purple-700',
  },
  cinema: {
    key: 'cinema',
    label: '영화관',
    icon: Film,
    defaultStay: 130,
    color: '#0f766e',
    bg: 'bg-teal-50 text-teal-700',
  },
  park: {
    key: 'park',
    label: '공원',
    icon: Trees,
    defaultStay: 40,
    color: '#15803d',
    bg: 'bg-green-50 text-green-700',
  },
  etc: {
    key: 'etc',
    label: '기타',
    icon: MapPin,
    defaultStay: 60,
    color: '#334155',
    bg: 'bg-slate-100 text-slate-700',
  },
};

export const CATEGORY_LIST = Object.values(CATEGORY_META);

/**
 * 브이월드 검색 결과의 category 문자열 + 이름 -> 내부 카테고리.
 * (브이월드 POI 분류는 공공시설 중심이라 키워드 기반으로 추정하고, 모르면 'etc')
 */
export function categoryFromVworld(category: string, name: string): Category {
  const hay = `${category} ${name}`;
  // 빵/디저트류는 카페로 분류한다.
  // 브이월드는 베이커리를 음식점업 하위로 두고, 가게에 따라 통신판매업 등으로 등록된 경우도 있어
  // 업종 문자열과 상호명을 함께 보고 판단한다. (예: "닌니쿠키"는 업종이 통신판매업)
  if (
    /카페|커피|coffee|cafe|베이커리|제과|제빵|빵|도넛|도너츠|디저트|티룸|쿠키|케이크|마카롱|타르트|과자/i.test(
      hay,
    )
  ) {
    return 'cafe';
  }
  if (/음식|식당|맛집|한식|중식|일식|양식|분식|국밥|고기|초밥|파스타|레스토랑/.test(hay)) return 'food';
  if (/공원|숲|호수|녹지|유원지|수목원/.test(hay)) return 'park';
  if (/영화|시네마|cgv|메가박스|롯데시네마/i.test(hay)) return 'cinema';
  if (/백화점|쇼핑|몰|아울렛|시장|마트/.test(hay)) return 'shopping';
  if (/관광|문화|박물관|미술관|전시|유적|사찰|고궁|명소|전망|체육|경기장/.test(hay)) return 'attraction';
  return 'etc';
}

/** 카카오 카테고리 그룹 코드 -> 내부 카테고리 */
export function categoryFromKakao(groupCode: string, name: string): Category {
  switch (groupCode) {
    case 'CE7':
      return 'cafe';
    case 'FD6':
      return 'food';
    case 'AT4':
    case 'CT1':
      return 'attraction';
    case 'MT1':
      return 'shopping';
    default:
      break;
  }
  if (/영화|시네마|cgv|메가박스|롯데시네마/i.test(name)) return 'cinema';
  if (/공원|숲|호수/.test(name)) return 'park';
  if (/카페|커피|coffee|cafe/i.test(name)) return 'cafe';
  if (/식당|맛집|국밥|김밥|고기|초밥|파스타|분식/.test(name)) return 'food';
  if (/백화점|몰|아울렛|시장/.test(name)) return 'shopping';
  return 'etc';
}
