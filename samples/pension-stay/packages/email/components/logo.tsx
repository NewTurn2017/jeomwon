import { Text } from "@react-email/components";

export function Logo({ storeName = "Jeomwon" }: { storeName?: string }) {
  return (
    <Text className="my-0 text-center font-semibold text-[20px]">
      {storeName}
    </Text>
  );
}
