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
