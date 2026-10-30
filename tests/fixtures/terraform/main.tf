# Minimal config with no providers (terraform_data is built in) so tests
# never download anything.
resource "terraform_data" "example" {
  input = "hello"
}

output "greeting" {
  value = terraform_data.example.output
}
