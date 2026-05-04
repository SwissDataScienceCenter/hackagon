package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"entgo.io/ent/entc"
	"entgo.io/ent/entc/gen"
	entschema "entgo.io/ent/schema"
)

func main() {
	graph, err := entc.LoadGraph("./db/schema", &gen.Config{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load ent schema: %v\n", err)
		os.Exit(1)
	}

	nodes := make([]*gen.Type, len(graph.Nodes))
	copy(nodes, graph.Nodes)
	sort.Slice(nodes, func(i, j int) bool {
		return nodes[i].Name < nodes[j].Name
	})

	fmt.Println("# Database Schema")
	fmt.Println()

	for _, node := range nodes {
		writeEntity(node)
	}
}

func schemaComment(t *gen.Type) string {
	ant := &entschema.CommentAnnotation{Text: ""}
	if t.Annotations == nil || t.Annotations[ant.Name()] == nil {
		return ""
	}
	b, err := json.Marshal(t.Annotations[ant.Name()])
	if err != nil {
		return ""
	}
	if err := json.Unmarshal(b, ant); err != nil {
		return ""
	}
	return ant.Text
}

func writeEntity(t *gen.Type) {
	fmt.Printf("## %s\n\n", t.Name)

	if comment := schemaComment(t); comment != "" {
		fmt.Printf("%s\n\n", comment)
	}

	writeFields(t)
	writeEdges(t)
	writeIndexes(t)
}

func writeFields(t *gen.Type) {
	if len(t.Fields) == 0 {
		return
	}

	fmt.Println("### Fields")
	fmt.Println()
	fmt.Println("| Column | Type | Required | Unique | Immutable | Default | Description |")
	fmt.Println("|--------|------|----------|--------|-----------|---------|-------------|")

	for _, f := range t.Fields {
		typeName := formatFieldType(f)
		required := boolYesNo(!f.Optional)
		unique := boolYesNo(f.Unique)
		immutable := boolYesNo(f.Immutable)
		def := boolYesNo(f.Default)
		comment := escapeMarkdown(f.Comment())

		fmt.Printf("| `%s` | %s | %s | %s | %s | %s | %s |\n",
			f.Name, typeName, required, unique, immutable, def, comment)
	}
	fmt.Println()
}

func formatFieldType(f *gen.Field) string {
	typeName := f.Type.String()
	if len(f.Enums) > 0 {
		vals := make([]string, 0, len(f.Enums))
		for _, e := range f.Enums {
			vals = append(vals, e.Value)
		}
		typeName = fmt.Sprintf("enum(%s)", strings.Join(vals, ", "))
	}
	return typeName
}

func writeEdges(t *gen.Type) {
	if len(t.Edges) == 0 {
		return
	}

	fmt.Println("### Relationships")
	fmt.Println()
	fmt.Println("| Edge | Target | Relation | Inverse | Required | Description |")
	fmt.Println("|------|--------|----------|---------|----------|-------------|")

	for _, e := range t.Edges {
		target := e.Type.Name
		rel := e.Rel.Type.String()
		inverse := boolYesNo(e.IsInverse())
		required := boolYesNo(!e.Optional)
		comment := escapeMarkdown(e.Comment())

		fmt.Printf("| `%s` | %s | %s | %s | %s | %s |\n",
			e.Name, target, rel, inverse, required, comment)
	}
	fmt.Println()
}

func writeIndexes(t *gen.Type) {
	if len(t.Indexes) == 0 {
		return
	}

	fmt.Println("### Indexes")
	fmt.Println()

	for _, idx := range t.Indexes {
		cols := strings.Join(idx.Columns, ", ")
		suffix := ""
		if idx.Unique {
			suffix = " *(unique)*"
		}
		fmt.Printf("- `%s`%s\n", cols, suffix)
	}
	fmt.Println()
}

func boolYesNo(v bool) string {
	if v {
		return "yes"
	}
	return "no"
}

func escapeMarkdown(s string) string {
	s = strings.ReplaceAll(s, "|", "\\|")
	s = strings.ReplaceAll(s, "\n", " ")
	return s
}
