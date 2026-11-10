"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Picker } from "@/components/picker";
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

  const activeCategories = data?.categories.filter((category) => category.active) ?? [];
  const itemReady =
    itemForm !== null &&
    itemForm.name.trim() !== "" &&
    itemForm.categoryId !== "" &&
    isAmount(itemForm.startingQuantity) &&
    isAmount(itemForm.lowStockLevel);

  function openItemForm(item?: Item, categoryId?: string) {
    setFormError(null);
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

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-3">
        <h1 className="font-serif text-5xl leading-none uppercase">Stock</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-11 px-5 text-base"
            onClick={() => {
              setFormError(null);
              setCategoryForm({ id: null, name: "" });
            }}
          >
            Add category
          </Button>
          <Button className="h-11 px-5 text-base" disabled={activeCategories.length === 0} onClick={() => openItemForm()}>
            Add item
          </Button>
        </div>
      </div>

      {isPending && <p className="text-muted-foreground">Loading stock.</p>}
      {isError && <p className="text-destructive">Could not load the stock. Check your connection and refresh.</p>}
      {data?.categories.length === 0 && (
        <p className="text-lg text-muted-foreground">
          No categories yet. Add a category first (for example Milk), then add items to it.
        </p>
      )}

      {data?.categories.map((category) => {
        const items = data.items.filter((item) => item.category_id === category.id);
        return (
          <section key={category.id} className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/40 pb-2">
              <h2
                className={
                  "font-label text-3xl font-semibold tracking-[0.06em] uppercase " +
                  (category.active ? "" : "text-ink/40 line-through")
                }
              >
                {category.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {category.active && (
                  <Button variant="ghost" className="h-9 px-3" onClick={() => openItemForm(undefined, category.id)}>
                    Add item here
                  </Button>
                )}
                <Button
                  variant="ghost"
                  className="h-9 px-3"
                  onClick={() => {
                    setFormError(null);
                    setCategoryForm({ id: category.id, name: category.name });
                  }}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 px-3"
                  onClick={() => setActive.mutate({ table: "stock_categories", id: category.id, active: !category.active })}
                >
                  {category.active ? "Hide" : "Show again"}
                </Button>
              </div>
            </div>

            {items.length === 0 && <p className="py-3 text-ink/60">No items in this category yet.</p>}

            <ul className="flex flex-col">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-ink/15 py-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className={"text-lg font-medium " + (item.active ? "" : "text-ink/40 line-through")}>
                        {item.name}
                      </span>
                      {item.active && item.isLow && (
                        <span className="bg-destructive px-2 py-0.5 text-sm font-medium text-white">Low</span>
                      )}
                      {!item.active && <span className="border border-ink/30 px-2 py-0.5 text-sm text-ink/60">Hidden</span>}
                    </span>
                    <span className="text-sm text-ink/60">
                      Low below {formatQuantity(item.low_stock_level, item.unit)} · started at{" "}
                      {formatQuantity(item.starting_quantity, item.unit)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-label text-2xl font-semibold tabular-nums">
                      {formatQuantity(item.current, item.unit)}
                    </span>
                    <Button variant="outline" className="h-9 px-3" onClick={() => openItemForm(item)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-9 px-3"
                      onClick={() => setActive.mutate({ table: "stock_items", id: item.id, active: !item.active })}
                    >
                      {item.active ? "Hide" : "Show again"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

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
            <DialogFooter>
              <Button
                type="submit"
                className="h-11 px-5 text-base"
                disabled={!categoryForm || categoryForm.name.trim() === "" || saveCategory.isPending}
              >
                Save category
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
              The current quantity is the starting quantity plus every change logged on the iPad.
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
            <div className="grid grid-cols-3 gap-3">
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
                <Label htmlFor="item-starting">Starting quantity</Label>
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
                <Label htmlFor="item-low">Low below</Label>
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
            <DialogFooter>
              <Button type="submit" className="h-11 px-5 text-base" disabled={!itemReady || saveItem.isPending}>
                Save item
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
