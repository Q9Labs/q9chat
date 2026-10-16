terraform {
  backend "s3" {
    bucket       = "q9chat-tofu-state"
    key          = "prod/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
