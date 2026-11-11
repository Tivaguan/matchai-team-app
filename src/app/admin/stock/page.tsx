"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StockLog } from "@/components/admin/stock-log";
import { IconMenu, Picker, Switch } from "@/components/picker";
import { formatQuantity } from "@/lib/format";
import { supabase } from "@/lib/supabase/client";

type Category = { id: string; name: string; active: boolean };
type Item = {
  id: string;
  category_id: string;
  name: string;
  unit: string;
  starting_quantity: number;
  low_stock_level: number;
  active: boolean;
  current: number;
  isLow: boolean;
};

type ItemForm = {
  id: string | null;
  name: string;
  categoryId: string;
  unit: string;
  startingQuantity: string;
  lowStockLevel: string;
};

const STOCK_KEY = ["admin", "stock"] as const;

async function loadStock(): Promise<{ categories: Category[]; items: Item[] }> {
  const [categories, items, levels] = await Promise.all([
    supabase.from("stock_categories").select("id, name, active").order("sort_order").order("name"),
    supabase
      .from("stock_items")
      .select("id, category_id, name, unit, starting_quantity, low_stock_level, active")
      .order("name"),
    supabase.from("stock_levels").select("item_id, current_quantity, is_low"),
  ]);
  if (categories.error) throw categories.error;
  if (items.error) throw items.error;
  if (levels.error) throw levels.error;

  const byItem = new Map(levels.data.map((level) => [level.item_id, level]));
  return {
    categories: categories.data,
    items: items.data.map((item) => ({
      ...item,
      current: byItem.get(item.id)?.current_quantity ?? item.starting_quantity,
      isLow: byItem.get(item.id)?.is_low ?? false,
    })),
  };
}

function isAmount(text: string) {
  return text.trim() !== "" && Number.isFinite(Number(text)) && Number(text) >= 0;
}

export default function StockPage() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: STOCK_KEY });
  const { data, isPending, isError } = useQuery({ queryKey: STOCK_KEY, queryFn: loadStock });

  const [categoryForm, setCategoryForm] = useState<{ id: string | null; name: string } | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);
  // Delete asks for a second tap before it happens.
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The log is a view of its own, opened from the Log button or from one item.
  const [logItemId, setLogItemId] = useState<string | null>(null);

  const saveCategory = useMutation({
    mutationFn: async (form: { id: string | null; name: string }) => {
      const name = form.name.trim();
      const { error } = form.id
        ? await supabase.from("stock_categories").update({ name }).eq("id", form.id)
        : await supabase.from("stock_categories").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      setCategoryForm(null);
      refresh();
    },
    onError: () => setFormError("Could not save the category. Check your connection and try again."),
  });

  const saveItem = useMutation({
    mutationFn: async (form: ItemForm) => {
      const values = {
        name: form.name.trim(),
        category_id: form.categoryId,
        unit: form.unit.trim(),
        starting_quantity: Number(form.startingQuantity),
        low_stock_level: Number(form.lowStockLevel),
      };
      const { error } = form.id
        ? await supabase.from("stock_items").update(values).eq("id", form.id)
        : await supabase.from("stock_items").insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      setItemForm(null);
      refresh();
    },
    onError: () => setFormError("Could not save the item. Check your connection and try again."),
  });

  const setActive = useMutation({
    mutationFn: async (target: { table: "stock_items" | "stock_categories"; id: string; active: boolean }) => {
      const { error } = await supabase.from(target.table).update({ active: target.active }).eq("id", target.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (target: { table: "stock_items" | "stock_categories"; id: string }) => {
      const { error } = await supabase.from(target.table).delete().eq("id", target.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setItemForm(null);
      setCategoryForm(null);
      setConfirmDelete(false);
      refresh();
    },
    onError: (_error, target) => {
      setConfirmDelete(false);
      setFormError(
        target.table === "stock_items"
          ? "This item has stock changes in the log, so it cannot be deleted. Hide it instead."
          : "This category still has items. Delete or move its items first, or hide the category.",
      );
    },
  });

  const activeCategories = data?.categories.filter((category) => category.active) ?? [];
  const itemReady =
    itemForm !== null &&
    itemForm.name.trim() !== "" &&
    itemForm.categoryId !== "" &&
    isAmount(itemForm.startingQuantity) &&
    isAmount(itemForm.lowStockLevel);

  function openItemForm(item?: Item, categoryId?: string) {
    setFormError(null);
    setConfirmDelete(false);
    setItemForm(
      item
        ? {
            id: item.id,
            name: item.name,
            categoryId: item.category_id,
            unit: item.unit,
            startingQuantity: String(item.starting_quantity),
            lowStockLevel: String(item.low_stock_level),
          }
        : {
            id: null,
            name: "",
            categoryId: categoryId ?? activeCategories[0]?.id ?? "",
            unit: "",
            startingQuantity: "0",
            lowStockLevel: "0",
          },
    );
  }

  const activeItems = data?.items.filter((item) => item.active) ?? [];
  const lowItems = activeItems.filter((item) => item.isLow);
  const showLowOnly = onlyLow;
  const editedCategory = data?.categories.find((category) => category.id === categoryForm?.id) ?? null;
  const editedItem = data?.items.find((item) => item.id === itemForm?.id) ?? null;
  const linkClass = "self-start text-base text-ink/70 underline underline-offset-4 hover:text-ink";
  // A row is exactly as wide as the lines around it; its text sits a little inside.
  const rowClass =
    "flex w-full justify-between gap-3 px-3 text-left hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

  if (logItemId !== null) {
    return <StockLog key={logItemId} initialItemId={logItemId} onBack={() => setLogItemId(null)} />;
  }

  return (
    <>
      {/* No title: the top bar already says Stock. Left: the add button and which items to show. Right: the log. */}
      {/* sm:min-h-14 matches the big date title on Cash and the Log, so the line sits at the same height on every page. */}
      <div className="box-content flex flex-wrap items-end justify-between gap-3 border-b border-ink pt-6 pb-3 sm:min-h-14">
        <h1 className="sr-only">Stock</h1>
        <div className="flex items-center gap-3">
          <IconMenu
            label="Add an item or a category"
            tone="solid"
            align="start"
            icon={<Plus className="size-5" aria-hidden="true" />}
            items={[
              { label: "New item", disabled: activeCategories.length === 0, onSelect: () => openItemForm() },
              {
                label: "New category",
                onSelect: () => {
                  setFormError(null);
                  setConfirmDelete(false);
                  setCategoryForm({ id: null, name: "" });
                },
              },
            ]}
          />
          <Switch
            label="Show every item or only the low ones"
            value={showLowOnly ? "low" : "all"}
            onChange={(next) => setOnlyLow(next === "low")}
            options={[
              { value: "all", label: `All ${activeItems.length}` },
              { value: "low", label: `Low ${lowItems.length}` },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={() => setLogItemId("all")}
          className="flex h-11 items-center gap-2 border border-ink/30 bg-white px-4 text-base font-medium hover:bg-ink hover:text-paper"
        >
          <History className="size-4" aria-hidden="true" />
          Log
        </button>
      </div>

      {isPending && <p className="text-muted-foreground">Loading stock.</p>}
      {isError && <p className="text-destructive">Could not load the stock. Check your connection and refresh.</p>}
      {data?.categories.length === 0 && (
        <p className="text-lg text-muted-foreground">
          No categories yet. Add a category first (for example Milk), then add items to it.
        </p>
      )}

      {data && data.categories.length > 0 && (
        <>
          {showLowOnly && lowItems.length === 0 && <p className="text-ink/60">Nothing is low right now.</p>}

          {/* One card per category, laid out like the cards of the shop's menu. */}
          <div className={"gap-5 md:columns-2 " + (data.categories.length > 4 ? "lg:columns-3" : "")}>
            {data.categories.map((category) => {
              const items = data.items.filter(
                (item) => item.category_id === category.id && (!showLowOnly || (item.active && item.isLow)),
              );
              if (showLowOnly && items.length === 0) return null;
              return (
                <section
                  key={category.id}
                  className={"mb-5 flex break-inside-avoid flex-col bg-white px-5 pt-3 pb-2 " + (category.active ? "" : "opacity-60")}
                >
                  <div className="border-b border-ink">
                    <button
                      type="button"
                      title="Rename, hide or delete this category"
                      onClick={() => {
                        setFormError(null);
                        setConfirmDelete(false);
                        setCategoryForm({ id: category.id, name: category.name });
                      }}
                      className={`${rowClass} items-baseline py-2.5`}
                    >
                      <span className="font-label text-2xl font-semibold tracking-[0.06em] uppercase">{category.name}</span>
                      <span className="text-sm text-ink/50">{category.active ? `${items.length}` : "Hidden"}</span>
                    </button>
                  </div>

                  <ul className="flex flex-col">
                    {items.map((item) => (
                      <li key={item.id} className="border-b border-dashed border-ink/20">
                        <button type="button" onClick={() => openItemForm(item)} className={`${rowClass} items-baseline py-3`}>
                          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                            <span className={"text-lg " + (item.active ? "" : "text-ink/40 line-through")}>{item.name}</span>
                            {item.active && item.isLow && (
                              <span className="font-label text-sm font-semibold tracking-[0.1em] text-destructive uppercase">
                                Low
                              </span>
                            )}
                            {!item.active && <span className="text-sm text-ink/50">Hidden</span>}
                          </span>
                          <span
                            className={
                              "shrink-0 font-label text-2xl font-semibold tabular-nums " +
                              (item.active && item.isLow ? "text-destructive" : "")
                            }
                          >
                            {formatQuantity(item.current, item.unit)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  {category.active && !showLowOnly && (
                    <button
                      type="button"
                      onClick={() => openItemForm(undefined, category.id)}
                      className={`${rowClass} items-center justify-start gap-2 py-3 text-ink/50 hover:text-ink`}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      Add item
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={categoryForm !== null} onOpenChange={(open) => !open && setCategoryForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryForm?.id ? "Rename category" : "Add category"}</DialogTitle>
            <DialogDescription>Categories group items on the counter iPad.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (categoryForm && categoryForm.name.trim() !== "") saveCategory.mutate(categoryForm);
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                autoComplete="off"
                value={categoryForm?.name ?? ""}
                onChange={(e) => setCategoryForm((form) => form && { ...form, name: e.target.value })}
                className="h-12 text-lg"
              />
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            {editedCategory && (
              <button
                type="button"
                className={linkClass}
                onClick={() => {
                  setActive.mutate({ table: "stock_categories", id: editedCategory.id, active: !editedCategory.active });
                  setCategoryForm(null);
                }}
              >
                {editedCategory.active ? "Hide this category from the iPad" : "Show this category on the iPad again"}
              </button>
            )}
            <DialogFooter>
              {editedCategory && (
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 px-5 text-lg sm:mr-auto"
                  disabled={remove.isPending}
                  onClick={() =>
                    confirmDelete
                      ? remove.mutate({ table: "stock_categories", id: editedCategory.id })
                      : setConfirmDelete(true)
                  }
                >
                  {confirmDelete ? "Tap again to delete" : "Delete"}
                </Button>
              )}
              <Button
                type="submit"
                className="h-11 px-5 text-lg"
                disabled={!categoryForm || categoryForm.name.trim() === "" || saveCategory.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={itemForm !== null} onOpenChange={(open) => !open && setItemForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{itemForm?.id ? "Edit item" : "Add item"}</DialogTitle>
            <DialogDescription>
              {editedItem
                ? `In stock now: ${formatQuantity(editedItem.current, editedItem.unit)}. That is the starting quantity plus every change logged on the iPad.`
                : "The current quantity is the starting quantity plus every change logged on the iPad."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (itemForm && itemReady) saveItem.mutate(itemForm);
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                autoComplete="off"
                value={itemForm?.name ?? ""}
                onChange={(e) => setItemForm((form) => form && { ...form, name: e.target.value })}
                className="h-12 text-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="item-category">Category</Label>
              <Picker
                id="item-category"
                className="w-full"
                value={itemForm?.categoryId ?? ""}
                onChange={(categoryId) => setItemForm((form) => form && { ...form, categoryId })}
                options={(data?.categories ?? [])
                  .filter((category) => category.active || category.id === itemForm?.categoryId)
                  .map((category) => ({ value: category.id, label: category.name }))}
              />
            </div>
            <div className="grid grid-cols-3 items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="item-unit">Unit</Label>
                <Input
                  id="item-unit"
                  autoComplete="off"
                  placeholder="L"
                  value={itemForm?.unit ?? ""}
                  onChange={(e) => setItemForm((form) => form && { ...form, unit: e.target.value })}
                  className="h-12 text-lg"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="item-starting" className="whitespace-nowrap">Starting qty</Label>
                <Input
                  id="item-starting"
                  inputMode="decimal"
                  autoComplete="off"
                  value={itemForm?.startingQuantity ?? ""}
                  onChange={(e) => setItemForm((form) => form && { ...form, startingQuantity: e.target.value })}
                  className="h-12 text-lg"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="item-low" className="whitespace-nowrap">Low below</Label>
                <Input
                  id="item-low"
                  inputMode="decimal"
                  autoComplete="off"
                  value={itemForm?.lowStockLevel ?? ""}
                  onChange={(e) => setItemForm((form) => form && { ...form, lowStockLevel: e.target.value })}
                  className="h-12 text-lg"
                />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            {editedItem && (
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <button
                  type="button"
                  className={linkClass}
                  onClick={() => {
                    setItemForm(null);
                    setLogItemId(editedItem.id);
                  }}
                >
                  See this item's log
                </button>
                <button
                  type="button"
                  className={linkClass}
                  onClick={() => {
                    setActive.mutate({ table: "stock_items", id: editedItem.id, active: !editedItem.active });
                    setItemForm(null);
                  }}
                >
                  {editedItem.active ? "Hide from the iPad" : "Show on the iPad again"}
                </button>
              </div>
            )}
            <DialogFooter>
              {editedItem && (
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 px-5 text-lg sm:mr-auto"
                  disabled={remove.isPending}
                  onClick={() =>
                    confirmDelete ? remove.mutate({ table: "stock_items", id: editedItem.id }) : setConfirmDelete(true)
                  }
                >
                  {confirmDelete ? "Tap again to delete" : "Delete"}
                </Button>
              )}
              <Button type="submit" className="h-11 px-5 text-lg" disabled={!itemReady || saveItem.isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
