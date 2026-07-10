# Jeomwon Domain Pack Examples

Each example is a complete domain pack JSON object accepted by `scripts/inject.mjs`.

## Salon

```json
{
  "domainKey": "salon-appointment",
  "storeName": "라움 헤어",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "designer-min", "label": "민 디자이너", "kind": "person" },
    { "key": "designer-seo", "label": "서 디자이너", "kind": "person" }
  ],
  "services": [
    {
      "key": "haircut",
      "label": "커트",
      "durationMinutes": 30,
      "slotUnit": "minutes:30",
      "price": "30000원",
      "resourceKind": "person"
    },
    {
      "key": "color",
      "label": "컬러",
      "durationMinutes": 90,
      "slotUnit": "minutes:30",
      "price": "90000원부터",
      "resourceKind": "person"
    }
  ],
  "businessHours": {
    "monday": { "closed": true },
    "tuesday": { "open": "10:00", "close": "20:00" },
    "wednesday": { "open": "10:00", "close": "20:00" },
    "thursday": { "open": "10:00", "close": "20:00" },
    "friday": { "open": "10:00", "close": "20:00" },
    "saturday": { "open": "10:00", "close": "18:00" },
    "sunday": { "open": "11:00", "close": "17:00" }
  },
  "blackouts": [],
  "policies": {
    "cancelWindowHours": 24,
    "holdMinutes": 10,
    "confirmationRequired": true
  },
  "adminWidget": "calendar",
  "notificationEmail": "ops@example.com",
  "features": {
    "email": true,
    "polar": false
  },
  "copy": {
    "chatTitle": "헤어 예약 도우미",
    "chatGreeting": "원하는 시술과 시간을 알려주시면 가능한 예약을 찾아드릴게요.",
    "chatPlaceholder": "예: 토요일 오후 커트 예약",
    "relevanceRefusal": "헤어 예약, 변경, 취소 문의만 도와드릴 수 있어요.",
    "confirmationRequired": "예약 확정은 고객 확인 후에만 진행할 수 있습니다.",
    "privacyRefusal": "공개 가능한 예약 정보만 안내할 수 있어요.",
    "availabilityIntro": "가능한 시술 시간을 찾았어요.",
    "holdCreated": "선택한 시술 시간을 임시로 잡아두었습니다.",
    "confirmed": "헤어 예약이 확정되었습니다.",
    "rescheduled": "헤어 예약이 변경되었습니다.",
    "cancelled": "헤어 예약이 취소되었습니다.",
    "cancelEscalated": "취소 가능 시간 규정에 걸려 매장 확인이 필요합니다.",
    "holdExpired": "임시 홀드 시간이 지나 예약 가능 상태로 돌아갔습니다.",
    "schemaError": "예약 요청 형식이 올바르지 않습니다.",
    "guardrailBanner": "헤어 예약 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 시간 번호를 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "임시 홀드는 10분 유지되며, 예약 24시간 이내 취소는 매장 확인이 필요합니다."
  }
}
```

## PC Bang

```json
{
  "domainKey": "pcbang-seat",
  "storeName": "레벨업 PC 라운지",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "seat-a1", "label": "A1", "kind": "seat" },
    { "key": "seat-a2", "label": "A2", "kind": "seat" },
    { "key": "seat-b1", "label": "B1", "kind": "seat" },
    { "key": "seat-b2", "label": "B2", "kind": "seat" }
  ],
  "services": [
    {
      "key": "hourly-seat",
      "label": "PC 좌석 이용",
      "slotUnit": "hour",
      "price": "시간당 1500원",
      "resourceKind": "seat"
    }
  ],
  "businessHours": {
    "monday": { "open": "00:00", "close": "23:59" },
    "tuesday": { "open": "00:00", "close": "23:59" },
    "wednesday": { "open": "00:00", "close": "23:59" },
    "thursday": { "open": "00:00", "close": "23:59" },
    "friday": { "open": "00:00", "close": "23:59" },
    "saturday": { "open": "00:00", "close": "23:59" },
    "sunday": { "open": "00:00", "close": "23:59" }
  },
  "blackouts": [],
  "policies": {
    "cancelWindowHours": 1,
    "holdMinutes": 5,
    "confirmationRequired": true
  },
  "adminWidget": "seatGrid",
  "notificationEmail": "ops@example.com",
  "features": {
    "email": false,
    "polar": true
  },
  "copy": {
    "chatTitle": "PC 좌석 도우미",
    "chatGreeting": "원하는 좌석이나 이용 시간을 알려주시면 가능한 자리를 찾아드릴게요.",
    "chatPlaceholder": "예: 친구랑 나란히 두 자리",
    "relevanceRefusal": "PC 좌석 예약과 이용 시간 문의만 도와드릴 수 있어요.",
    "confirmationRequired": "좌석 배정은 고객 확인 후에만 진행할 수 있습니다.",
    "privacyRefusal": "공개 가능한 좌석 정보만 안내할 수 있어요.",
    "availabilityIntro": "이용 가능한 좌석을 찾았어요.",
    "holdCreated": "선택한 좌석을 잠시 잡아두었습니다.",
    "confirmed": "PC 좌석 예약이 확정되었습니다.",
    "rescheduled": "좌석 이용 시간이 변경되었습니다.",
    "cancelled": "좌석 예약이 취소되었습니다.",
    "cancelEscalated": "이용 직전 취소라 직원 확인이 필요합니다.",
    "holdExpired": "좌석 홀드 시간이 지나 다시 이용 가능 상태가 되었습니다.",
    "schemaError": "좌석 요청 형식이 올바르지 않습니다.",
    "guardrailBanner": "PC 좌석 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 좌석 번호를 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "연장이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "좌석 홀드는 5분 유지되며, 이용 시작 1시간 이내 취소는 직원 확인이 필요합니다."
  }
}
```

## Library And Study Room

```json
{
  "domainKey": "library-study",
  "storeName": "도담 도서관",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "seat-quiet-1", "label": "열람석 Q1", "kind": "seat" },
    { "key": "seat-quiet-2", "label": "열람석 Q2", "kind": "seat" },
    { "key": "room-a", "label": "스터디룸 A", "kind": "room" },
    { "key": "room-b", "label": "스터디룸 B", "kind": "room" }
  ],
  "services": [
    {
      "key": "reading-seat",
      "label": "열람석 예약",
      "slotUnit": "hour",
      "price": "무료",
      "resourceKind": "seat"
    },
    {
      "key": "study-room",
      "label": "스터디룸 예약",
      "durationMinutes": 120,
      "slotUnit": "hour",
      "price": "무료",
      "resourceKind": "room"
    }
  ],
  "businessHours": {
    "monday": { "open": "09:00", "close": "22:00" },
    "tuesday": { "open": "09:00", "close": "22:00" },
    "wednesday": { "open": "09:00", "close": "22:00" },
    "thursday": { "open": "09:00", "close": "22:00" },
    "friday": { "open": "09:00", "close": "22:00" },
    "saturday": { "open": "10:00", "close": "18:00" },
    "sunday": { "closed": true }
  },
  "blackouts": [],
  "policies": {
    "cancelWindowHours": 2,
    "holdMinutes": 10,
    "confirmationRequired": true
  },
  "adminWidget": "seatGrid",
  "notificationEmail": "library-ops@example.com",
  "features": {
    "email": true,
    "polar": false
  },
  "copy": {
    "chatTitle": "도서관 예약 도우미",
    "chatGreeting": "열람석이나 스터디룸 이용 시간을 알려주시면 예약 가능 여부를 확인해드릴게요.",
    "chatPlaceholder": "예: 오늘 저녁 스터디룸",
    "relevanceRefusal": "도서관 좌석과 스터디룸 예약 문의만 도와드릴 수 있어요.",
    "confirmationRequired": "예약 확정은 이용자 확인 후에만 진행할 수 있습니다.",
    "privacyRefusal": "공개 가능한 예약 정보만 안내할 수 있어요.",
    "availabilityIntro": "예약 가능한 공간을 찾았어요.",
    "holdCreated": "선택한 공간을 임시로 잡아두었습니다.",
    "confirmed": "도서관 예약이 확정되었습니다.",
    "rescheduled": "도서관 예약이 변경되었습니다.",
    "cancelled": "도서관 예약이 취소되었습니다.",
    "cancelEscalated": "이용 직전 취소라 사서 확인이 필요합니다.",
    "holdExpired": "임시 홀드 시간이 지나 예약 가능 상태로 돌아갔습니다.",
    "schemaError": "예약 요청 형식이 올바르지 않습니다.",
    "guardrailBanner": "도서관 예약 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 공간과 시간을 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "임시 홀드는 10분 유지되며, 이용 시작 2시간 이내 취소는 사서 확인이 필요합니다."
  }
}
```

## Pension Stay

```json
{
  "domainKey": "pension-stay",
  "storeName": "소나무 펜션",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "room-pine", "label": "솔방울 객실", "kind": "room" },
    { "key": "room-river", "label": "강가 객실", "kind": "room" },
    { "key": "room-family", "label": "패밀리 객실", "kind": "room" }
  ],
  "services": [
    {
      "key": "one-night-stay",
      "label": "1박 숙박",
      "slotUnit": "day",
      "dayUnit": {
        "checkInTime": "15:00",
        "checkOutTime": "11:00",
        "checkInLabel": "체크인",
        "checkOutLabel": "체크아웃"
      },
      "price": "120000원부터",
      "resourceKind": "room"
    }
  ],
  "businessHours": {
    "monday": { "open": "00:00", "close": "23:59" },
    "tuesday": { "open": "00:00", "close": "23:59" },
    "wednesday": { "open": "00:00", "close": "23:59" },
    "thursday": { "open": "00:00", "close": "23:59" },
    "friday": { "open": "00:00", "close": "23:59" },
    "saturday": { "open": "00:00", "close": "23:59" },
    "sunday": { "open": "00:00", "close": "23:59" }
  },
  "blackouts": [
    {
      "startIso": "2026-12-24T00:00:00+09:00",
      "endIso": "2026-12-26T00:00:00+09:00",
      "reason": "성수기 수동 배정"
    }
  ],
  "policies": {
    "cancelWindowHours": 72,
    "holdMinutes": 30,
    "confirmationRequired": true
  },
  "adminWidget": "calendar",
  "notificationEmail": "stay-ops@example.com",
  "features": {
    "email": true,
    "polar": false
  },
  "copy": {
    "chatTitle": "펜션 예약 도우미",
    "chatGreeting": "원하는 숙박 날짜와 객실을 알려주시면 예약 가능한 객실을 찾아드릴게요.",
    "chatPlaceholder": "예: 다음 주 토요일 1박 가능한 객실",
    "relevanceRefusal": "펜션 객실 예약, 변경, 취소 문의만 도와드릴 수 있어요.",
    "confirmationRequired": "숙박 예약 확정은 고객 확인 후에만 진행할 수 있습니다.",
    "privacyRefusal": "공개 가능한 숙박 예약 정보만 안내할 수 있어요.",
    "availabilityIntro": "숙박 가능한 객실을 찾았어요.",
    "holdCreated": "선택한 객실을 임시로 잡아두었습니다.",
    "confirmed": "숙박 예약이 확정되었습니다.",
    "rescheduled": "숙박 예약이 변경되었습니다.",
    "cancelled": "숙박 예약이 취소되었습니다.",
    "cancelEscalated": "체크인 72시간 이내 취소라 운영자 확인이 필요합니다.",
    "holdExpired": "객실 홀드 시간이 지나 예약 가능 상태로 돌아갔습니다.",
    "schemaError": "숙박 요청 형식이 올바르지 않습니다.",
    "guardrailBanner": "펜션 객실 예약 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 객실 번호를 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "객실 홀드는 30분 유지되며, 체크인 72시간 이내 취소는 운영자 확인이 필요합니다."
  }
}
```

## Generic Appointment

```json
{
  "domainKey": "generic-appointment",
  "storeName": "Jeomwon Demo Desk",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "advisor-a", "label": "상담 담당 A", "kind": "person" },
    { "key": "advisor-b", "label": "상담 담당 B", "kind": "person" },
    { "key": "room-1", "label": "회의실 1", "kind": "room" }
  ],
  "services": [
    {
      "key": "consultation",
      "label": "상담 예약",
      "durationMinutes": 30,
      "slotUnit": "minutes:30",
      "price": "무료",
      "resourceKind": "person"
    },
    {
      "key": "planning-session",
      "label": "플래닝 세션",
      "slotUnit": "hour",
      "price": "문의",
      "resourceKind": "room"
    }
  ],
  "businessHours": {
    "monday": { "open": "09:00", "close": "18:00" },
    "tuesday": { "open": "09:00", "close": "18:00" },
    "wednesday": { "open": "09:00", "close": "18:00" },
    "thursday": { "open": "09:00", "close": "18:00" },
    "friday": { "open": "09:00", "close": "18:00" },
    "saturday": { "open": "10:00", "close": "14:00" },
    "sunday": { "closed": true }
  },
  "blackouts": [],
  "policies": {
    "cancelWindowHours": 24,
    "holdMinutes": 10,
    "confirmationRequired": true
  },
  "adminWidget": "calendar",
  "notificationEmail": "ops@example.com",
  "features": {
    "email": true,
    "polar": false
  },
  "copy": {
    "chatTitle": "예약 도우미",
    "chatGreeting": "가능한 시간 확인, 임시 홀드, 확정, 변경/취소 안내를 도와드릴게요.",
    "chatPlaceholder": "예약 문의를 입력하세요",
    "relevanceRefusal": "예약 관련 문의만 도와드릴 수 있어요. 가능 시간, 예약 확정, 변경, 취소를 문의해 주세요.",
    "confirmationRequired": "확정, 변경, 취소는 고객 확인 없이 바로 처리할 수 없습니다.",
    "privacyRefusal": "공개 가능한 예약 정보만 안내할 수 있어요.",
    "availabilityIntro": "요청하신 조건으로 가능한 시간을 확인했어요.",
    "holdCreated": "선택한 시간을 임시로 잡아두었습니다.",
    "confirmed": "예약이 확정되었습니다.",
    "rescheduled": "예약이 변경되었습니다.",
    "cancelled": "예약이 취소되었습니다.",
    "cancelEscalated": "취소 가능 시간 규정에 걸려 운영자 확인이 필요합니다.",
    "holdExpired": "임시 홀드 시간이 지나 예약 가능 상태로 돌아갔습니다.",
    "schemaError": "요청 형식이 올바르지 않습니다.",
    "guardrailBanner": "예약 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 시간을 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "확정 전 임시 홀드는 10분 유지되며, 예약 시작 24시간 이내 취소는 운영자 확인이 필요합니다."
  }
}
```

## Studycafe Seat

Promoted from the showcase pack `04-studycafe/domain-pack.json` in the separate `jeomwon-showcase` repository (`$JEOMWON_SHOWCASE_ROOT/04-studycafe/domain-pack.json`). The runnable showcase build is not shipped in this repository; the JSON below is the promoted pack copied structurally.

```json
{
  "domainKey": "studycafe-seat",
  "storeName": "몰입 스터디카페",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "seat-f1", "label": "집중석 F1", "kind": "seat" },
    { "key": "seat-f2", "label": "집중석 F2", "kind": "seat" },
    { "key": "seat-f3", "label": "집중석 F3", "kind": "seat" },
    { "key": "seat-f4", "label": "집중석 F4", "kind": "seat" },
    { "key": "seat-f5", "label": "집중석 F5", "kind": "seat" },
    { "key": "seat-f6", "label": "집중석 F6", "kind": "seat" },
    { "key": "room-s4", "label": "스터디룸 4인", "kind": "room" },
    { "key": "room-s6", "label": "스터디룸 6인", "kind": "room" }
  ],
  "services": [
    {
      "key": "focus-seat",
      "label": "집중석 이용",
      "slotUnit": "hour",
      "price": "시간당 2000원",
      "resourceKind": "seat"
    },
    {
      "key": "study-room",
      "label": "스터디룸 예약",
      "durationMinutes": 120,
      "slotUnit": "hour",
      "price": "시간당 8000원",
      "resourceKind": "room"
    }
  ],
  "businessHours": {
    "monday": { "open": "00:00", "close": "23:59" },
    "tuesday": { "open": "00:00", "close": "23:59" },
    "wednesday": { "open": "00:00", "close": "23:59" },
    "thursday": { "open": "00:00", "close": "23:59" },
    "friday": { "open": "00:00", "close": "23:59" },
    "saturday": { "open": "00:00", "close": "23:59" },
    "sunday": { "open": "00:00", "close": "23:59" }
  },
  "blackouts": [],
  "policies": {
    "cancelWindowHours": 2,
    "holdMinutes": 10,
    "confirmationRequired": true
  },
  "adminWidget": "seatGrid",
  "notificationEmail": "ops@moleep.example",
  "features": {
    "email": true,
    "polar": false
  },
  "copy": {
    "chatTitle": "스터디카페 예약 도우미",
    "chatGreeting": "집중석이나 스터디룸 이용 시간을 알려주시면 예약 가능 여부를 확인해드릴게요.",
    "chatPlaceholder": "예: 오늘 저녁 스터디룸 4인",
    "relevanceRefusal": "스터디카페 좌석과 스터디룸 예약 문의만 도와드릴 수 있어요.",
    "confirmationRequired": "예약 확정은 이용자 확인 후에만 진행할 수 있습니다.",
    "privacyRefusal": "공개 가능한 예약 정보만 안내할 수 있어요.",
    "availabilityIntro": "예약 가능한 자리를 찾았어요.",
    "holdCreated": "선택한 자리를 임시로 잡아두었습니다.",
    "confirmed": "스터디카페 예약이 확정되었습니다.",
    "rescheduled": "스터디카페 예약이 변경되었습니다.",
    "cancelled": "스터디카페 예약이 취소되었습니다.",
    "cancelEscalated": "이용 직전 취소라 매니저 확인이 필요합니다.",
    "holdExpired": "임시 홀드 시간이 지나 예약 가능 상태로 돌아갔습니다.",
    "schemaError": "예약 요청 형식이 올바르지 않습니다.",
    "guardrailBanner": "스터디카페 예약 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 자리와 시간을 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "임시 홀드는 10분 유지되며, 이용 시작 2시간 이내 취소는 매니저 확인이 필요합니다."
  }
}
```

## Futsal Court

Promoted from the showcase pack `05-futsal-court/domain-pack.json` in the separate `jeomwon-showcase` repository (`$JEOMWON_SHOWCASE_ROOT/05-futsal-court/domain-pack.json`). The runnable showcase build is not shipped in this repository; the JSON below is the promoted pack copied structurally.

```json
{
  "domainKey": "futsal-court",
  "storeName": "킥오프 풋살파크",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "pitch-a", "label": "A구장 (실내)", "kind": "unit" },
    { "key": "pitch-b", "label": "B구장 (야외)", "kind": "unit" },
    { "key": "pitch-c", "label": "C구장 (풋살 전용)", "kind": "unit" }
  ],
  "services": [
    {
      "key": "court-rental",
      "label": "구장 대관",
      "slotUnit": "hour",
      "price": "시간당 60000원",
      "resourceKind": "unit"
    },
    {
      "key": "court-rental-2h",
      "label": "구장 대관 2시간",
      "durationMinutes": 120,
      "slotUnit": "hour",
      "price": "110000원",
      "resourceKind": "unit"
    }
  ],
  "businessHours": {
    "monday": { "open": "08:00", "close": "23:00" },
    "tuesday": { "open": "08:00", "close": "23:00" },
    "wednesday": { "open": "08:00", "close": "23:00" },
    "thursday": { "open": "08:00", "close": "23:00" },
    "friday": { "open": "08:00", "close": "23:00" },
    "saturday": { "open": "06:00", "close": "23:00" },
    "sunday": { "open": "06:00", "close": "23:00" }
  },
  "blackouts": [],
  "policies": {
    "cancelWindowHours": 24,
    "holdMinutes": 15,
    "confirmationRequired": true
  },
  "adminWidget": "calendar",
  "notificationEmail": "ops@kickoffpark.example",
  "features": {
    "email": true,
    "polar": true
  },
  "copy": {
    "chatTitle": "풋살장 예약 도우미",
    "chatGreeting": "원하는 날짜와 시간을 알려주시면 예약 가능한 구장을 찾아드릴게요.",
    "chatPlaceholder": "예: 토요일 저녁 8시 2시간 대관",
    "relevanceRefusal": "풋살 구장 예약, 변경, 취소 문의만 도와드릴 수 있어요.",
    "confirmationRequired": "구장 예약 확정은 고객 확인 후에만 진행할 수 있습니다.",
    "privacyRefusal": "공개 가능한 예약 정보만 안내할 수 있어요.",
    "availabilityIntro": "예약 가능한 구장 시간을 찾았어요.",
    "holdCreated": "선택한 구장 시간을 임시로 잡아두었습니다.",
    "confirmed": "구장 예약이 확정되었습니다.",
    "rescheduled": "구장 예약이 변경되었습니다.",
    "cancelled": "구장 예약이 취소되었습니다.",
    "cancelEscalated": "이용 24시간 이내 취소라 운영자 확인이 필요합니다.",
    "holdExpired": "구장 홀드 시간이 지나 예약 가능 상태로 돌아갔습니다.",
    "schemaError": "예약 요청 형식이 올바르지 않습니다.",
    "guardrailBanner": "풋살 구장 예약 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 시간 번호를 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "구장 홀드는 15분 유지되며, 이용 시작 24시간 이내 취소는 운영자 확인이 필요합니다."
  }
}
```

## Webinar Live

Promoted from the showcase pack `06-webinar-live/domain-pack.json` in the separate `jeomwon-showcase` repository (`$JEOMWON_SHOWCASE_ROOT/06-webinar-live/domain-pack.json`). The runnable showcase build is not shipped in this repository; the JSON below is the promoted pack copied structurally.

```json
{
  "domainKey": "webinar-live",
  "storeName": "라이브온 웨비나",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "seat-01", "label": "01", "kind": "seat" },
    { "key": "seat-02", "label": "02", "kind": "seat" },
    { "key": "seat-03", "label": "03", "kind": "seat" },
    { "key": "seat-04", "label": "04", "kind": "seat" },
    { "key": "seat-05", "label": "05", "kind": "seat" },
    { "key": "seat-06", "label": "06", "kind": "seat" },
    { "key": "seat-07", "label": "07", "kind": "seat" },
    { "key": "seat-08", "label": "08", "kind": "seat" },
    { "key": "seat-09", "label": "09", "kind": "seat" },
    { "key": "seat-10", "label": "10", "kind": "seat" },
    { "key": "seat-11", "label": "11", "kind": "seat" },
    { "key": "seat-12", "label": "12", "kind": "seat" },
    { "key": "seat-13", "label": "13", "kind": "seat" },
    { "key": "seat-14", "label": "14", "kind": "seat" },
    { "key": "seat-15", "label": "15", "kind": "seat" },
    { "key": "seat-16", "label": "16", "kind": "seat" }
  ],
  "services": [
    {
      "key": "live-webinar",
      "label": "라이브 웨비나 참가",
      "slotUnit": "hour",
      "price": "회당 29000원",
      "resourceKind": "seat"
    },
    {
      "key": "webinar-workshop",
      "label": "심화 워크샵 (2시간)",
      "durationMinutes": 120,
      "slotUnit": "hour",
      "price": "49000원",
      "resourceKind": "seat"
    }
  ],
  "businessHours": {
    "monday": { "open": "08:00", "close": "23:00" },
    "tuesday": { "open": "08:00", "close": "23:00" },
    "wednesday": { "open": "08:00", "close": "23:00" },
    "thursday": { "open": "08:00", "close": "23:00" },
    "friday": { "open": "08:00", "close": "23:00" },
    "saturday": { "open": "08:00", "close": "23:00" },
    "sunday": { "open": "08:00", "close": "23:00" }
  },
  "blackouts": [],
  "policies": {
    "cancelWindowHours": 24,
    "holdMinutes": 10,
    "confirmationRequired": true
  },
  "adminWidget": "seatGrid",
  "notificationEmail": "ops@liveon.example",
  "features": {
    "email": true,
    "polar": false
  },
  "copy": {
    "chatTitle": "웨비나 참가 도우미",
    "chatGreeting": "듣고 싶은 웨비나 시간을 알려주시면 남은 참가석을 찾아드릴게요.",
    "chatPlaceholder": "예: 이번 주 목요일 저녁 8시 라이브 웨비나",
    "relevanceRefusal": "웨비나 참가 신청, 변경, 취소 문의만 도와드릴 수 있어요.",
    "confirmationRequired": "참가 확정은 신청자 확인 후에만 진행할 수 있습니다.",
    "privacyRefusal": "공개 가능한 웨비나 정보만 안내할 수 있어요.",
    "availabilityIntro": "참가 가능한 웨비나 시간을 찾았어요.",
    "holdCreated": "선택한 웨비나 참가석을 잠시 잡아두었습니다.",
    "confirmed": "웨비나 참가가 확정되었습니다.",
    "rescheduled": "웨비나 참가 시간이 변경되었습니다.",
    "cancelled": "웨비나 참가가 취소되었습니다.",
    "cancelEscalated": "시작 24시간 이내 취소라 운영자 확인이 필요합니다.",
    "holdExpired": "참가석 홀드 시간이 지나 다시 신청 가능 상태가 되었습니다.",
    "schemaError": "참가 신청 형식이 올바르지 않습니다.",
    "guardrailBanner": "웨비나 참가 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 웨비나 시간을 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "참가석 홀드는 10분 유지되며, 시작 24시간 이내 취소는 운영자 확인이 필요합니다."
  }
}
```

## Equipment Rental

New kit-authored pack that fills the `unit × minutes:30 × calendar` and `unit × day × calendar` coverage cells (see the coverage catalog below). Unlike the promoted packs above, it has no showcase source; it is defined here.

```json
{
  "domainKey": "equipment-rental",
  "storeName": "모두 장비 대여소",
  "storeTimezone": "Asia/Seoul",
  "locale": "ko-KR",
  "resources": [
    { "key": "equipment-1", "label": "공용 장비 1", "kind": "unit" }
  ],
  "services": [
    {
      "key": "equipment-30m",
      "label": "장비 30분 대여",
      "durationMinutes": 30,
      "slotUnit": "minutes:30",
      "price": "5000원",
      "resourceKind": "unit"
    },
    {
      "key": "equipment-day",
      "label": "장비 하루 대여",
      "slotUnit": "day",
      "dayUnit": {
        "checkInTime": "09:00",
        "checkOutTime": "18:00",
        "checkInLabel": "수령",
        "checkOutLabel": "반납"
      },
      "price": "30000원",
      "resourceKind": "unit"
    }
  ],
  "businessHours": {
    "monday": { "open": "09:00", "close": "18:00" },
    "tuesday": { "open": "09:00", "close": "18:00" },
    "wednesday": { "open": "09:00", "close": "18:00" },
    "thursday": { "open": "09:00", "close": "18:00" },
    "friday": { "open": "09:00", "close": "18:00" },
    "saturday": { "open": "09:00", "close": "18:00" },
    "sunday": { "closed": true }
  },
  "blackouts": [],
  "policies": {
    "cancelWindowHours": 24,
    "holdMinutes": 10,
    "confirmationRequired": true
  },
  "adminWidget": "calendar",
  "notificationEmail": "equipment-ops@example.com",
  "features": {
    "email": true,
    "polar": false
  },
  "copy": {
    "chatTitle": "장비 대여 도우미",
    "chatGreeting": "원하는 장비와 대여 시간을 알려주시면 가능한 일정을 찾아드릴게요.",
    "chatPlaceholder": "예: 토요일 하루 장비 대여",
    "relevanceRefusal": "장비 대여, 변경, 취소 문의만 도와드릴 수 있어요.",
    "confirmationRequired": "대여 확정은 고객 확인 후에만 진행할 수 있습니다.",
    "privacyRefusal": "공개 가능한 장비 대여 정보만 안내할 수 있어요.",
    "availabilityIntro": "대여 가능한 일정을 찾았어요.",
    "holdCreated": "선택한 장비를 임시로 잡아두었습니다.",
    "confirmed": "장비 대여가 확정되었습니다.",
    "rescheduled": "장비 대여 일정이 변경되었습니다.",
    "cancelled": "장비 대여가 취소되었습니다.",
    "cancelEscalated": "대여 시작 24시간 이내 취소라 운영자 확인이 필요합니다.",
    "holdExpired": "장비 홀드 시간이 지나 다시 대여 가능 상태가 되었습니다.",
    "schemaError": "장비 대여 요청 형식이 올바르지 않습니다.",
    "guardrailBanner": "장비 대여 관련 문의만 도와드릴 수 있어요.",
    "nextStepAvailability": "원하는 대여 일정을 선택해 주세요.",
    "nextStepHold": "내용이 맞으면 확인한다고 답해 주세요.",
    "nextStepConfirmed": "변경이나 취소가 필요하면 다시 말씀해 주세요.",
    "policySummary": "장비 홀드는 10분 유지되며, 대여 시작 24시간 이내 취소는 운영자 확인이 필요합니다."
  }
}
```

## Coverage Catalog

This catalog is the exhaustive `resourceKind × slotUnit × adminWidget` universe: four resource kinds (`person`, `seat`, `room`, `unit`) × three slot units (`minutes:30`, `hour`, `day`) × two admin widgets (`calendar`, `seatGrid`) = 24 service-level cells. Each cell is derived only from a pack service's `resourceKind` and `slotUnit` paired with that pack's `adminWidget`; duplicate services and unrelated resources never inflate a cell. A covered cell lists every embedded pack that supplies that combination; an uncovered cell is `gap`.

After the three showcase promotions the catalog covers 6/24 cells. Adding the kit-authored `equipment-rental` pack — which supplies `unit × minutes:30 × calendar` and `unit × day × calendar` — brings coverage to 8/24, leaving 16 gaps.

<!-- matrix:start -->
| Resource kind | Slot unit | calendar | seatGrid |
| --- | --- | --- | --- |
| person | minutes:30 | `generic-appointment`, `salon-appointment` | gap |
| person | hour | gap | gap |
| person | day | gap | gap |
| seat | minutes:30 | gap | gap |
| seat | hour | gap | `library-study`, `pcbang-seat`, `studycafe-seat`, `webinar-live` |
| seat | day | gap | gap |
| room | minutes:30 | gap | gap |
| room | hour | `generic-appointment` | `library-study`, `studycafe-seat` |
| room | day | `pension-stay` | gap |
| unit | minutes:30 | `equipment-rental` | gap |
| unit | hour | `futsal-court` | gap |
| unit | day | `equipment-rental` | gap |
<!-- matrix:end -->
