/**
 * 카카오맵 JavaScript SDK 최소 타입 선언.
 * (공식 @types 패키지를 쓰지 않고 이 프로젝트에서 사용하는 API만 선언)
 */
declare namespace kakao.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }
  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
    isEmpty(): boolean;
  }
  class Size {
    constructor(width: number, height: number);
  }
  class Point {
    constructor(x: number, y: number);
  }
  class Map {
    constructor(container: HTMLElement, options: { center: LatLng; level?: number });
    setCenter(latlng: LatLng): void;
    setBounds(bounds: LatLngBounds, paddingTop?: number, paddingRight?: number): void;
    relayout(): void;
    setLevel(level: number): void;
    getLevel(): number;
  }
  class Polyline {
    constructor(options: {
      path: LatLng[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
    });
    setMap(map: Map | null): void;
  }
  class CustomOverlay {
    constructor(options: {
      position: LatLng;
      content: string | HTMLElement;
      yAnchor?: number;
      xAnchor?: number;
      zIndex?: number;
      clickable?: boolean;
    });
    setMap(map: Map | null): void;
  }
  function load(callback: () => void): void;

  namespace services {
    enum Status {
      OK = 'OK',
      ZERO_RESULT = 'ZERO_RESULT',
      ERROR = 'ERROR',
    }
    interface PlaceSearchResultItem {
      id: string;
      place_name: string;
      category_group_code: string;
      category_name: string;
      address_name: string;
      road_address_name: string;
      phone: string;
      x: string;
      y: string;
      place_url: string;
    }
    class Places {
      keywordSearch(
        keyword: string,
        callback: (data: PlaceSearchResultItem[], status: Status) => void,
        options?: { size?: number; page?: number; location?: LatLng; radius?: number },
      ): void;
    }
    interface AddressSearchResultItem {
      address_name: string;
      x: string;
      y: string;
    }
    class Geocoder {
      addressSearch(
        address: string,
        callback: (result: AddressSearchResultItem[], status: Status) => void,
      ): void;
    }
  }
}

interface Window {
  kakao?: typeof kakao;
}
